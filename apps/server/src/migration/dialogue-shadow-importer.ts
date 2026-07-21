import { Prisma } from "@prisma/client";
import { digestCanonicalJson } from "@airoaming/shared";
import { readFile } from "node:fs/promises";
import * as path from "node:path";
import { MigrationAuditError, readVerifiedSnapshot, type VerifiedSnapshot } from "./migration-audit.service.js";
import { normalizeMigrationDecisionArtifact, type MigrationDecisionArtifact } from "./migration-decision.js";
import { MigrationLedgerError, type MigrationRunRecord } from "./migration-ledger.js";
import { mapLegacyComicFormat } from "./comic-format-migration.plugin.js";
import { createComicFormatReport, type ComicFormatReport, type ComicFormatReportProject } from "./migration-report.js";
import { PrismaMigrationLedgerRepository } from "./prisma-migration-ledger.repository.js";
import { RuntimeBundleFileService } from "./runtime-bundle-file.service.js";
import { PrismaService } from "../persistence/prisma.service.js";

export class DialogueShadowImportError extends Error { constructor(readonly code: string) { super(code); } }

function object(value: unknown, code: string): Record<string, unknown> { if (!value || typeof value !== "object" || Array.isArray(value)) throw new DialogueShadowImportError(code); return value as Record<string, unknown>; }
function stringField(value: Record<string, unknown>, key: string, fallback = ""): string { return typeof value[key] === "string" && value[key].trim() ? value[key].trim() : fallback; }
function nullableString(value: Record<string, unknown>, key: string): string | null { const result = stringField(value, key); return result || null; }
function dateField(value: Record<string, unknown>, key: string): Date { const result = new Date(stringField(value, key, "2000-01-01T00:00:00.000Z")); return Number.isNaN(result.getTime()) ? new Date("2000-01-01T00:00:00.000Z") : result; }
function jsonValue(value: unknown): Prisma.InputJsonValue { return value as Prisma.InputJsonValue; }
function stableId(type: string, sourceKey: string): string { return PrismaMigrationLedgerRepository.stableEntityId(type, sourceKey); }
function projectSourceKey(projectId: string): string { return `workspace-v1:${projectId}:Project:${projectId}`; }
function chapterSourceKey(projectId: string, chapterId: string): string { return `workspace-v1:${projectId}:Chapter:${chapterId}`; }

interface ThreadPlan {
  targetId: string;
  sourceKey: string;
  sourceDigest: `sha256:${string}`;
  payloadDigest: `sha256:${string}`;
  sourceStorageKey: string;
  projectId: string;
  chapterId: string | null;
  stepKey: string;
  scopeKey: string;
  title: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  legacySessionId: string | null;
  messages: Array<{ targetId: string; sourceKey: string; payloadDigest: `sha256:${string}`; legacyId: string; role: string; content: string; status: string; providerId: string | null; modelId: string | null; createdAt: Date; updatedAt: Date; completedAt: Date | null; errorJson: Prisma.InputJsonValue | null }>;
  toolResults: Array<{ targetId: string; sourceKey: string; payloadDigest: `sha256:${string}`; legacyId: string; messageId: string; tool: string; status: string; summary: string; payloadJson: Prisma.InputJsonValue; createdAt: Date }>;
}

interface PendingArtifactPlan {
  targetId: string;
  sourceKey: string;
  sourceDigest: `sha256:${string}`;
  sourceStorageKey: string;
  projectId: string;
  chapterId: string | null;
  threadId: string;
  kind: "script_import" | "inspiration_seeds" | "script_outline_decision" | "layout_editor_command_set";
  status: "pending";
  activeSlotKey: string;
  payloadJson: Prisma.InputJsonValue;
  schemaVersion: number;
  payloadDigest: `sha256:${string}`;
  sourceMessageId: string | null;
  toolResultId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

async function readRuntimeBundle(snapshot: VerifiedSnapshot): Promise<{ bundle: Record<string, unknown>; digest: `sha256:${string}` }> {
  try {
    const result = await new RuntimeBundleFileService().readAndVerify(path.join(snapshot.root, "runtime-bundle.json"));
    if (result.digest !== snapshot.sealed.runtimeBundleDigest) throw new DialogueShadowImportError("MIGRATION_RUNTIME_BUNDLE_DIGEST_MISMATCH");
    return { bundle: object(result.bundle, "MIGRATION_RUNTIME_BUNDLE_INVALID"), digest: result.digest };
  } catch (error) {
    if (error instanceof DialogueShadowImportError) throw error;
    throw new DialogueShadowImportError(error instanceof Error && "code" in error ? String((error as Error & { code: unknown }).code) : "MIGRATION_RUNTIME_BUNDLE_INVALID");
  }
}

/** G3-M3-A15：只导入明确 captured 的对话运行态；M0 deferred bundle 只产生零实体成功结果。 */
export class DialogueShadowImporter {
  private readonly ledger: PrismaMigrationLedgerRepository;
  constructor(private readonly prisma: PrismaService, ledger?: PrismaMigrationLedgerRepository) { this.ledger = ledger ?? new PrismaMigrationLedgerRepository(prisma); }

  async import(snapshotPath: string, decisionsPath: string, options: { runId?: string; startedAt?: string } = {}): Promise<{ run: MigrationRunRecord; report: ComicFormatReport; decisions: MigrationDecisionArtifact }> {
    const snapshot = await readVerifiedSnapshot(snapshotPath);
    const decisions = await this.readDecisions(decisionsPath, snapshot.sealed.sourceManifestDigest);
    const run = await this.ledger.beginRun({ kind: "shadow", importerVersion: "g3-m3-a15", sourceManifestDigest: snapshot.sourceManifest.manifestDigest, snapshotManifestDigest: snapshot.snapshotManifest.manifestDigest, decisionsDigest: decisions.decisionsDigest, id: options.runId, startedAt: options.startedAt });
    try {
      const runtime = await readRuntimeBundle(snapshot);
      const conversation = object(runtime.bundle.conversationState, "MIGRATION_DIALOGUE_STATE_INVALID");
      const captured = conversation.captured === true;
      const rawThreads = captured && Array.isArray(conversation.threads) ? conversation.threads : [];
      const pendingState = object(runtime.bundle.pendingDialogueState, "MIGRATION_PENDING_DIALOGUE_STATE_INVALID");
      const pendingCaptured = pendingState.captured === true;
      const rawPendingArtifacts = pendingCaptured && Array.isArray(pendingState.artifacts) ? pendingState.artifacts : [];
      if (pendingCaptured && !Array.isArray(pendingState.artifacts)) throw new DialogueShadowImportError("MIGRATION_PENDING_DIALOGUE_ARTIFACTS_INVALID");
      const result = await this.buildPlans(rawThreads, rawPendingArtifacts, runtime.digest);
      if (result.plans.length > 0) await this.ledger.withTransaction(async (tx) => { for (const plan of result.plans) await this.importThread(tx, run.id, plan); });
      if (result.pendingPlans.length > 0) await this.ledger.withTransaction(async (tx) => { for (const plan of result.pendingPlans) await this.importPendingArtifact(tx, run.id, plan); });
      for (const issue of result.issues) await this.ledger.withTransaction((tx) => this.ledger.recordGenericIssueInTransaction(tx, run.id, issue));
      const report = await this.buildReport(snapshot, result.blockedProjects, { ConversationThread: result.threadCount, ConversationMessage: result.messageCount, DialogueToolResult: result.toolResultCount, DialogueRuntimeSession: result.sessionCount, PendingDialogueArtifact: result.pendingPlans.length });
      const finished = await this.ledger.finishRun(run.id, { status: result.issues.length > 0 ? "blocked" : "succeeded", reportDigest: report.reportDigest, counts: { ...report.summary, conversationThreadCount: result.threadCount, conversationMessageCount: result.messageCount, dialogueToolResultCount: result.toolResultCount, dialogueRuntimeSessionCount: result.sessionCount, pendingDialogueArtifactCount: result.pendingPlans.length }, verification: { schemaVersion: 1, sourceManifestVerified: true, snapshotManifestVerified: true, runtimeBundleVerified: true, dialogueCaptured: captured, pendingDialogueCaptured: pendingCaptured }, finishedAt: new Date().toISOString() });
      return { run: finished, report, decisions };
    } catch (error) {
      const code = error instanceof Error && "code" in error ? String((error as Error & { code: unknown }).code) : "MIGRATION_IMPORT_FAILED";
      try { await this.ledger.finishRun(run.id, { status: "failed", errorCode: code, finishedAt: new Date().toISOString() }); } catch { /* preserve original */ }
      if (error instanceof DialogueShadowImportError || error instanceof MigrationLedgerError || error instanceof MigrationAuditError) throw error;
      throw new DialogueShadowImportError(code);
    }
  }

  private async readDecisions(decisionsPath: string, expected: `sha256:${string}`): Promise<MigrationDecisionArtifact> {
    if (!path.isAbsolute(decisionsPath)) throw new DialogueShadowImportError("MIGRATION_DECISION_PATH_INVALID");
    try { return normalizeMigrationDecisionArtifact(JSON.parse(await readFile(decisionsPath, "utf8")) as unknown, expected); } catch (error) { if (error instanceof Error && "code" in error) throw new DialogueShadowImportError(String((error as Error & { code: unknown }).code)); throw new DialogueShadowImportError("MIGRATION_DECISION_INVALID"); }
  }

  private async buildPlans(rawThreads: unknown[], rawPendingArtifacts: unknown[], sourceDigest: `sha256:${string}`): Promise<{ plans: ThreadPlan[]; pendingPlans: PendingArtifactPlan[]; issues: Array<{ issueKey: string; code: string; entityType: string; entityId: string; sourceKey: string; storageKey: string; detailJson: Prisma.InputJsonValue }>; blockedProjects: Set<string>; threadCount: number; messageCount: number; toolResultCount: number; sessionCount: number }> {
    const plans: ThreadPlan[] = [];
    const pendingPlans: PendingArtifactPlan[] = [];
    const issues: Array<{ issueKey: string; code: string; entityType: string; entityId: string; sourceKey: string; storageKey: string; detailJson: Prisma.InputJsonValue }> = [];
    const blockedProjects = new Set<string>();
    const threadTargetByLegacy = new Map<string, string>();
    const messageTargetByLegacy = new Map<string, string>();
    const toolResultTargetByLegacy = new Map<string, string>();
    const db = this.prisma.database();
    for (const [index, raw] of rawThreads.entries()) {
      const thread = object(raw, "MIGRATION_DIALOGUE_THREAD_INVALID");
      const legacyProjectId = stringField(thread, "projectId");
      const legacyThreadId = stringField(thread, "id", `thread-${index + 1}`);
      const stepKey = stringField(thread, "stepKey", "project_story");
      const legacyChapterId = nullableString(thread, "chapterId");
      const projectId = stableId("Project", projectSourceKey(legacyProjectId));
      const chapterId = legacyChapterId ? stableId("Chapter", chapterSourceKey(legacyProjectId, legacyChapterId)) : null;
      const project = await db.project.findUnique({ where: { id: projectId } });
      const chapter = chapterId ? await db.chapter.findUnique({ where: { id: chapterId } }) : null;
      if (!project || (chapterId && (!chapter || chapter.projectId !== projectId))) {
        const issueKey = `project:${legacyProjectId}:dialogue:${legacyThreadId}`;
        issues.push({ issueKey, code: "DIALOGUE_SOURCE_UNRESOLVED", entityType: "ConversationThread", entityId: projectId, sourceKey: `workspace-v1:${legacyProjectId}:ConversationThread:${legacyThreadId}`, storageKey: "runtime-bundle.json", detailJson: jsonValue({ schemaVersion: 1, reason: "Project or Chapter target missing" }) });
        blockedProjects.add(legacyProjectId);
        continue;
      }
      const scopeKey = chapterId ? `chapter:${chapterId}` : "project";
      const sourceKey = `workspace-v1:${legacyProjectId}:ConversationThread:${legacyThreadId}`;
      const targetId = stableId("ConversationThread", sourceKey);
      threadTargetByLegacy.set(`${legacyProjectId}:${legacyThreadId}`, targetId);
      const rawMessages = Array.isArray(thread.messages) ? thread.messages : [];
      const messageIdByLegacy = new Map<string, string>();
      const messages = rawMessages.map((rawMessage, messageIndex) => {
        const message = object(rawMessage, "MIGRATION_DIALOGUE_MESSAGE_INVALID");
        const legacyId = stringField(message, "id", `message-${messageIndex + 1}`);
        const messageSourceKey = `${sourceKey}:Message:${legacyId}`;
        const messageTargetId = stableId("ConversationMessage", messageSourceKey);
        messageIdByLegacy.set(legacyId, messageTargetId);
        messageTargetByLegacy.set(`${legacyProjectId}:${legacyThreadId}:${legacyId}`, messageTargetId);
        const error = message.error && typeof message.error === "object" ? jsonValue(message.error) : null;
        return { targetId: messageTargetId, sourceKey: messageSourceKey, payloadDigest: digestCanonicalJson({ threadId: targetId, legacyId, role: stringField(message, "role", "user"), content: stringField(message, "content"), status: stringField(message, "status", "completed") }), legacyId, role: stringField(message, "role", "user"), content: stringField(message, "content"), status: stringField(message, "status", "completed"), providerId: nullableString(message, "providerId"), modelId: nullableString(message, "modelId"), createdAt: dateField(message, "createdAt"), updatedAt: dateField(message, "updatedAt"), completedAt: message.completedAt ? dateField(message, "completedAt") : null, errorJson: error };
      });
      const toolResults = (Array.isArray(thread.toolResults) ? thread.toolResults : []).map((rawResult, resultIndex) => {
        const result = object(rawResult, "MIGRATION_DIALOGUE_TOOL_RESULT_INVALID");
        const legacyId = stringField(result, "id", `tool-result-${resultIndex + 1}`);
        const resultSourceKey = `${sourceKey}:DialogueToolResult:${legacyId}`;
        const messageId = messageIdByLegacy.get(stringField(result, "messageId"));
        if (!messageId) return null;
        const payload = jsonValue(result);
        const targetId = stableId("DialogueToolResult", resultSourceKey);
        toolResultTargetByLegacy.set(`${legacyProjectId}:${legacyThreadId}:${legacyId}`, targetId);
        return { targetId, sourceKey: resultSourceKey, payloadDigest: digestCanonicalJson(result), legacyId, messageId, tool: stringField(result, "tool", "legacy_unknown"), status: stringField(result, "status", "failed"), summary: stringField(result, "summary"), payloadJson: payload, createdAt: dateField(result, "createdAt") };
      }).filter((value): value is NonNullable<typeof value> => value !== null);
      plans.push({ targetId, sourceKey, sourceDigest, payloadDigest: digestCanonicalJson({ projectId, chapterId, stepKey, scopeKey, title: stringField(thread, "title", stepKey), status: stringField(thread, "status", "active"), messages: messages.map((message) => message.payloadDigest), toolResults: toolResults.map((result) => result.payloadDigest) }), sourceStorageKey: "runtime-bundle.json", projectId, chapterId, stepKey, scopeKey, title: stringField(thread, "title", stepKey), status: stringField(thread, "status", "active"), createdAt: dateField(thread, "createdAt"), updatedAt: dateField(thread, "updatedAt"), legacySessionId: nullableString(thread, "openCodeSessionId"), messages, toolResults });
    }
    const allowedKinds = new Set<PendingArtifactPlan["kind"]>(["script_import", "inspiration_seeds", "script_outline_decision", "layout_editor_command_set"]);
    for (const [index, raw] of rawPendingArtifacts.entries()) {
      const artifact = object(raw, "MIGRATION_PENDING_DIALOGUE_ARTIFACT_INVALID");
      const legacyProjectId = stringField(artifact, "projectId");
      const legacyThreadId = stringField(artifact, "threadId");
      const kind = stringField(artifact, "kind") as PendingArtifactPlan["kind"];
      const legacyArtifactId = stringField(artifact, "id", `pending-${index + 1}`);
      const projectId = stableId("Project", projectSourceKey(legacyProjectId));
      const chapterLegacyId = nullableString(artifact, "chapterId");
      const chapterId = chapterLegacyId ? stableId("Chapter", chapterSourceKey(legacyProjectId, chapterLegacyId)) : null;
      const threadId = threadTargetByLegacy.get(`${legacyProjectId}:${legacyThreadId}`);
      const issueKey = `project:${legacyProjectId}:pending-dialogue:${legacyArtifactId}`;
      const project = await db.project.findUnique({ where: { id: projectId } });
      const chapter = chapterId ? await db.chapter.findUnique({ where: { id: chapterId } }) : null;
      const declaredStatus = stringField(artifact, "status", "pending");
      if (!allowedKinds.has(kind) || declaredStatus !== "pending" || !threadId || !legacyProjectId || !project || (chapterId && (!chapter || chapter.projectId !== projectId))) {
        issues.push({ issueKey, code: !allowedKinds.has(kind) ? "PENDING_DIALOGUE_KIND_UNSUPPORTED" : "PENDING_DIALOGUE_SOURCE_UNRESOLVED", entityType: "PendingDialogueArtifact", entityId: stableId("PendingDialogueArtifact", `workspace-v1:${legacyProjectId}:PendingDialogueArtifact:${legacyArtifactId}`), sourceKey: `workspace-v1:${legacyProjectId}:PendingDialogueArtifact:${legacyArtifactId}`, storageKey: "runtime-bundle.json", detailJson: jsonValue({ schemaVersion: 1, reason: !allowedKinds.has(kind) ? "kind is outside G1 closed enum" : "Project, Chapter, or ConversationThread target missing" }) });
        blockedProjects.add(legacyProjectId);
        continue;
      }
      const payload = artifact.payload;
      if (payload === undefined) throw new DialogueShadowImportError("MIGRATION_PENDING_DIALOGUE_PAYLOAD_INVALID");
      const payloadDigest = digestCanonicalJson(payload);
      const declaredPayloadDigest = nullableString(artifact, "payloadDigest");
      if (declaredPayloadDigest && declaredPayloadDigest !== payloadDigest) throw new DialogueShadowImportError("MIGRATION_PENDING_DIALOGUE_PAYLOAD_DIGEST_MISMATCH");
      const legacySourceMessageId = nullableString(artifact, "sourceMessageId");
      const legacyToolResultId = nullableString(artifact, "toolResultId");
      const sourceMessageId = legacySourceMessageId ? messageTargetByLegacy.get(`${legacyProjectId}:${legacyThreadId}:${legacySourceMessageId}`) ?? null : null;
      const toolResultId = legacyToolResultId ? toolResultTargetByLegacy.get(`${legacyProjectId}:${legacyThreadId}:${legacyToolResultId}`) ?? null : null;
      if ((legacySourceMessageId && !sourceMessageId) || (legacyToolResultId && !toolResultId)) throw new DialogueShadowImportError("MIGRATION_PENDING_DIALOGUE_REFERENCE_UNRESOLVED");
      const sourceKey = `workspace-v1:${legacyProjectId}:PendingDialogueArtifact:${legacyArtifactId}`;
      pendingPlans.push({ targetId: stableId("PendingDialogueArtifact", sourceKey), sourceKey, sourceDigest, sourceStorageKey: "runtime-bundle.json", projectId, chapterId, threadId, kind, status: "pending", activeSlotKey: `workspace-v1:${legacyProjectId}:PendingDialogueSlot:${stringField(artifact, "activeSlotKey", legacyArtifactId)}`, payloadJson: jsonValue(payload), schemaVersion: Number.isInteger(artifact.schemaVersion) ? Number(artifact.schemaVersion) : 1, payloadDigest, sourceMessageId, toolResultId, createdAt: dateField(artifact, "createdAt"), updatedAt: dateField(artifact, "updatedAt") });
    }
    return { plans, pendingPlans, issues, blockedProjects, threadCount: plans.length, messageCount: plans.reduce((count, plan) => count + plan.messages.length, 0), toolResultCount: plans.reduce((count, plan) => count + plan.toolResults.length, 0), sessionCount: plans.filter((plan) => plan.legacySessionId).length };
  }

  private async buildReport(snapshot: VerifiedSnapshot, blockedProjects: Set<string>, entityCounts: Record<string, number>): Promise<ComicFormatReport> {
    const projects: ComicFormatReportProject[] = [];
    for (const item of snapshot.sourceManifest.items.filter((candidate) => /^projects\/[^/]+\/project\.json$/.test(candidate.storageKey)).sort((a, b) => a.storageKey.localeCompare(b.storageKey))) {
      const legacyProjectId = item.storageKey.split("/")[1];
      const metadata = object(JSON.parse((await snapshot.readPayload(item.storageKey)).bytes.toString("utf8")) as unknown, "MIGRATION_SOURCE_PROJECT_INVALID");
      const mapping = mapLegacyComicFormat(metadata.comicFormat);
      const blocked = blockedProjects.has(legacyProjectId);
      projects.push({ projectId: legacyProjectId, sourceStorageKey: item.storageKey, sourceDigest: item.sha256, originalComicFormat: { kind: mapping.originalValueKind, preview: mapping.originalValuePreview }, mappingKind: mapping.mappingKind, targetComicFormat: mapping.targetComicFormat, layoutPresetIntent: mapping.layoutPresetIntent, issueKey: blocked ? `project:${legacyProjectId}:dialogue` : null, resolutionStatus: blocked ? "open" : "not_needed", importStatus: blocked ? "blocked" : "imported" });
    }
    if (projects.length === 0) projects.push({ projectId: "dialogue", sourceStorageKey: "runtime-bundle.json", sourceDigest: `sha256:${"0".repeat(64)}`, originalComicFormat: { kind: "missing", preview: "missing" }, mappingKind: "canonical", targetComicFormat: null, layoutPresetIntent: null, issueKey: null, resolutionStatus: "not_needed", importStatus: "imported" });
    return createComicFormatReport(projects, { entityCounts });
  }

  private async importThread(tx: Prisma.TransactionClient, runId: string, plan: ThreadPlan): Promise<void> {
    const existingSource = await tx.importedEntitySource.findUnique({ where: { sourceKey: plan.sourceKey } });
    if (existingSource && (existingSource.entityId !== plan.targetId || existingSource.sourceDigest !== plan.sourceDigest || existingSource.payloadDigest !== plan.payloadDigest)) throw new MigrationLedgerError("MIGRATION_SOURCE_CONFLICT");
    const existing = await tx.conversationThread.findUnique({ where: { id: plan.targetId } });
    if (existing && (existing.projectId !== plan.projectId || existing.chapterId !== plan.chapterId || existing.stepKey !== plan.stepKey || existing.scopeKey !== plan.scopeKey)) throw new MigrationLedgerError("MIGRATION_PAYLOAD_CONFLICT");
    if (!existing) await tx.conversationThread.create({ data: { id: plan.targetId, projectId: plan.projectId, chapterId: plan.chapterId, stepKey: plan.stepKey, scopeKey: plan.scopeKey, title: plan.title, status: plan.status === "archived" ? "archived" : "active", createdAt: plan.createdAt, updatedAt: plan.updatedAt } });
    await this.ledger.recordImportedEntitySourceInTransaction(tx, runId, { sourceKey: plan.sourceKey, entityType: "ConversationThread", entityId: plan.targetId, sourceStorageKey: plan.sourceStorageKey, sourceDigest: plan.sourceDigest, payloadDigest: plan.payloadDigest, provenanceStatus: "complete" });
    for (const message of plan.messages) {
      const messageSource = await tx.importedEntitySource.findUnique({ where: { sourceKey: message.sourceKey } });
      if (messageSource && (messageSource.entityId !== message.targetId || messageSource.sourceDigest !== plan.sourceDigest || messageSource.payloadDigest !== message.payloadDigest)) throw new MigrationLedgerError("MIGRATION_SOURCE_CONFLICT");
      const existingMessage = await tx.conversationMessage.findUnique({ where: { id: message.targetId } });
      if (!existingMessage) await tx.conversationMessage.create({ data: { id: message.targetId, threadId: plan.targetId, role: message.role, content: message.content, status: message.status === "running" ? "failed" : message.status, providerId: message.providerId, modelId: message.modelId, ...(message.errorJson ? { errorJson: message.errorJson, errorSchemaVersion: 1 } : {}), createdAt: message.createdAt, updatedAt: message.updatedAt, completedAt: message.completedAt ?? message.status === "running" ? message.updatedAt : null } });
      await this.ledger.recordImportedEntitySourceInTransaction(tx, runId, { sourceKey: message.sourceKey, entityType: "ConversationMessage", entityId: message.targetId, sourceStorageKey: plan.sourceStorageKey, sourceDigest: plan.sourceDigest, payloadDigest: message.payloadDigest, provenanceStatus: "complete" });
    }
    for (const result of plan.toolResults) {
      const resultSource = await tx.importedEntitySource.findUnique({ where: { sourceKey: result.sourceKey } });
      if (resultSource && (resultSource.entityId !== result.targetId || resultSource.sourceDigest !== plan.sourceDigest || resultSource.payloadDigest !== result.payloadDigest)) throw new MigrationLedgerError("MIGRATION_SOURCE_CONFLICT");
      const existingResult = await tx.dialogueToolResult.findUnique({ where: { id: result.targetId } });
      if (!existingResult) await tx.dialogueToolResult.create({ data: { id: result.targetId, threadId: plan.targetId, messageId: result.messageId, toolCallId: result.legacyId, tool: result.tool, status: ["succeeded", "failed", "needs_user_confirmation"].includes(result.status) ? result.status : "failed", summary: result.summary, payloadJson: result.payloadJson, schemaVersion: 1, payloadDigest: result.payloadDigest, createdAt: result.createdAt } });
      await this.ledger.recordImportedEntitySourceInTransaction(tx, runId, { sourceKey: result.sourceKey, entityType: "DialogueToolResult", entityId: result.targetId, sourceStorageKey: plan.sourceStorageKey, sourceDigest: plan.sourceDigest, payloadDigest: result.payloadDigest, provenanceStatus: "complete" });
    }
    if (plan.legacySessionId) {
      const sessionSourceKey = `${plan.sourceKey}:DialogueRuntimeSession:${plan.legacySessionId}`;
      const sessionId = stableId("DialogueRuntimeSession", sessionSourceKey);
      const existingSession = await tx.dialogueRuntimeSession.findUnique({ where: { id: sessionId } });
      if (!existingSession) {
        await tx.dialogueRuntimeSession.create({ data: { id: sessionId, threadId: plan.targetId, runtime: "opencode", externalSessionId: plan.legacySessionId, status: "active", providerId: null, modelId: null, variant: "legacy_import", createdAt: plan.createdAt, updatedAt: plan.updatedAt, closedAt: null } });
        await tx.dialogueRuntimeSession.update({ where: { id: sessionId }, data: { status: "closed", closedAt: plan.updatedAt, updatedAt: plan.updatedAt } });
      }
      await this.ledger.recordImportedEntitySourceInTransaction(tx, runId, { sourceKey: sessionSourceKey, entityType: "DialogueRuntimeSession", entityId: sessionId, sourceStorageKey: plan.sourceStorageKey, sourceDigest: plan.sourceDigest, payloadDigest: digestCanonicalJson({ threadId: plan.targetId, externalSessionId: plan.legacySessionId, runtime: "opencode" }), provenanceStatus: "complete" });
    }
  }

  private async importPendingArtifact(tx: Prisma.TransactionClient, runId: string, plan: PendingArtifactPlan): Promise<void> {
    const existingSource = await tx.importedEntitySource.findUnique({ where: { sourceKey: plan.sourceKey } });
    if (existingSource && (existingSource.entityId !== plan.targetId || existingSource.sourceDigest !== plan.sourceDigest || existingSource.payloadDigest !== plan.payloadDigest)) throw new MigrationLedgerError("MIGRATION_SOURCE_CONFLICT");
    const existing = await tx.pendingDialogueArtifact.findUnique({ where: { id: plan.targetId } });
    if (existing && (existing.projectId !== plan.projectId || existing.chapterId !== plan.chapterId || existing.threadId !== plan.threadId || existing.kind !== plan.kind || existing.payloadDigest !== plan.payloadDigest)) throw new MigrationLedgerError("MIGRATION_PAYLOAD_CONFLICT");
    if (!existing) await tx.pendingDialogueArtifact.create({ data: { id: plan.targetId, projectId: plan.projectId, chapterId: plan.chapterId, threadId: plan.threadId, kind: plan.kind, status: plan.status, activeSlotKey: plan.activeSlotKey, payloadJson: plan.payloadJson, schemaVersion: plan.schemaVersion, payloadDigest: plan.payloadDigest, sourceMessageId: plan.sourceMessageId, toolResultId: plan.toolResultId, createdAt: plan.createdAt, updatedAt: plan.updatedAt, resolvedAt: null } });
    await this.ledger.recordImportedEntitySourceInTransaction(tx, runId, { sourceKey: plan.sourceKey, entityType: "PendingDialogueArtifact", entityId: plan.targetId, sourceStorageKey: plan.sourceStorageKey, sourceDigest: plan.sourceDigest, payloadDigest: plan.payloadDigest, provenanceStatus: "complete" });
  }
}
