import { BadRequestException, Inject, Injectable, Optional } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";
import type {
  AIRuntimeModelSelection,
  DialogueMessageItem,
  DialogueStreamEvent,
  DialogueThread,
  DialogueToolResult,
  SendDialogueMessageRequest,
  SendDialogueMessageResponse,
  WorkbenchSnapshot,
} from "@airoaming/shared";
import { digestCanonicalJson } from "@airoaming/shared";
import { redactCredentials } from "../migration/credential-redactor.js";
import { OpenCodeRuntimeService } from "../ai-runtime/opencode-runtime.service.js";
import { ProjectsService } from "../projects/projects.service.js";
import { ScriptDialogueService } from "./script-dialogue.service.js";
import { StoryStructureDialogueService } from "./story-structure-dialogue.service.js";
import { StoryboardDialogueService } from "./storyboard-dialogue.service.js";
import { shouldGenerateProjectCharacters, shouldOrganizeProvidedScript, formatAttachmentContext } from "./dialogue-intent.util.js";
import { buildPrompt, STEP_LABELS } from "./dialogue-prompt.util.js";
import { getThreadKey } from "./dialogue-key.util.js";
import type {
  DialogueTurn,
  LocalDialogueThread,
  PendingDialogueCaptureArtifact,
} from "./dialogue-types.js";
import { MaintenanceCoordinator } from "../maintenance/maintenance-coordinator.service.js";
import { PrismaService } from "../persistence/prisma.service.js";

@Injectable()
export class DialogueService {
  private readonly threads = new Map<string, LocalDialogueThread>();
  private readonly activeStreamingAssistantMessageIds = new Set<string>();

  constructor(
    @Inject(ProjectsService) private readonly projectsService: ProjectsService,
    @Inject(OpenCodeRuntimeService) private readonly openCodeRuntimeService: OpenCodeRuntimeService,
    @Inject(ScriptDialogueService) private readonly scriptDialogue: ScriptDialogueService,
    @Inject(StoryStructureDialogueService) private readonly storyStructureDialogue: StoryStructureDialogueService,
    @Inject(StoryboardDialogueService) private readonly storyboardDialogue: StoryboardDialogueService,
    @Inject(PrismaService) private readonly prismaService: PrismaService,
    @Optional() @Inject(MaintenanceCoordinator) private readonly maintenance?: MaintenanceCoordinator,
  ) {
    this.projectsService.onProjectDeleted((projectId) => this.deleteProjectRuntimeState(projectId));
    this.scriptDialogue.setEnsureSession((thread, snapshot, signal) => this.ensureOpenCodeSession(thread, snapshot, signal));
    this.storyStructureDialogue.setEnsureSession((thread, snapshot, signal) => this.ensureOpenCodeSession(thread, snapshot, signal));
    this.storyboardDialogue.setEnsureSession((thread, snapshot, signal) => this.ensureOpenCodeSession(thread, snapshot, signal));
    this.maintenance?.registerRuntimeStateProvider("dialogue", () => this.captureRuntimeState());
  }

  /** G3-M3-A15：停写封口时提供可验证的只读对话快照，并封存可恢复的 pending 对话工件。 */
  captureRuntimeState(): { conversationState: unknown; pendingDialogueState: unknown } {
    const threads = [...this.threads.values()].map((thread) => ({
      id: thread.id,
      projectId: thread.projectId,
      stepKey: thread.stepKey,
      chapterId: thread.chapterId,
      openCodeSessionId: thread.openCodeSessionId,
      title: `${thread.stepKey}`,
      status: "active",
      createdAt: thread.createdAt,
      updatedAt: thread.updatedAt,
      messages: thread.messages.map((message) => ({ ...message })),
      toolResults: thread.toolResults.map((result) => ({ ...result })),
    }));
    const pendingArtifacts: PendingDialogueCaptureArtifact[] = this.scriptDialogue.capturePendingArtifacts(this.threads);
    return {
      conversationState: { schemaVersion: 1, captured: true, kind: "dialogue_runtime_state_v1", threads },
      pendingDialogueState: { schemaVersion: 1, captured: true, kind: "dialogue_pending_state_v1", artifacts: pendingArtifacts },
    };
  }

  async getProjectThread(projectId: string, stepKey: string, chapterId?: string | null): Promise<DialogueThread> {
    await this.assertDatabaseProjectActive(projectId);
    await this.projectsService.getWorkbenchSnapshot(projectId, chapterId ?? undefined);
    const normalizedStepKey = this.normalizeStepKey(stepKey);
    if (this.prismaService.isDatabaseMode()) {
      const thread = await this.getOrCreateDatabaseThread(projectId, normalizedStepKey, chapterId ?? null);
      await this.settleDatabaseRunningMessages(thread.id);
      const refreshed = await this.getOrCreateDatabaseThread(projectId, normalizedStepKey, chapterId ?? null);
      return this.toThreadDto(refreshed);
    }
    const thread = this.getOrCreateThread(projectId, normalizedStepKey, chapterId ?? null);
    this.settleInactiveRunningMessages(thread);
    return this.toThreadDto(thread);
  }

  async sendMessage(
    projectId: string,
    stepKey: string,
    input: SendDialogueMessageRequest,
  ): Promise<SendDialogueMessageResponse> {
    const execute = () => this.sendMessageInternal(projectId, stepKey, input);
    return this.maintenance ? this.maintenance.runMutation("dialogue.send", execute, "dialogue") : execute();
  }

  private async sendMessageInternal(
    projectId: string,
    stepKey: string,
    input: SendDialogueMessageRequest,
  ): Promise<SendDialogueMessageResponse> {
    const turn = await this.createDialogueTurn(projectId, stepKey, input);
    const toolResults = await this.tryHandleScriptTools(turn, input);

    if (toolResults.length > 0) {
      this.recordToolResults(turn.thread, toolResults);
      await this.persistToolResults(turn.thread, toolResults);
      await this.syncPendingArtifactsForThread(turn.thread.projectId, turn.thread.id, input.content);
      const lastResult = toolResults[toolResults.length - 1];
      this.completeAssistantMessage(turn, lastResult.summary, input.model ?? this.openCodeRuntimeService.getDefaultModel());
      await this.persistMessageUpdate(turn.assistantMessage);
      return {
        thread: this.toThreadDto(turn.thread),
        userMessage: turn.userMessage,
        assistantMessage: turn.assistantMessage,
        toolResults,
      };
    }

    try {
      const openCodeSessionId = await this.ensureOpenCodeSession(turn.thread, turn.snapshot);
      const response = await this.openCodeRuntimeService.sendMessage({
        sessionId: openCodeSessionId,
        model: input.model,
        content: turn.prompt,
      });
      this.completeAssistantMessage(turn, response.content, response.model);
      await this.persistMessageUpdate(turn.assistantMessage);
    } catch (error) {
      this.failAssistantMessage(turn, error);
      await this.persistMessageUpdate(turn.assistantMessage);
    }

    return {
      thread: this.toThreadDto(turn.thread),
      userMessage: turn.userMessage,
      assistantMessage: turn.assistantMessage,
    };
  }

  async streamMessage(
    projectId: string,
    stepKey: string,
    input: SendDialogueMessageRequest,
    emit: (event: DialogueStreamEvent) => void | Promise<void>,
    signal?: AbortSignal,
  ): Promise<void> {
    const execute = () => this.streamMessageInternal(projectId, stepKey, input, emit, signal);
    return this.maintenance ? this.maintenance.runStream("dialogue.stream", execute) : execute();
  }

  private async streamMessageInternal(
    projectId: string,
    stepKey: string,
    input: SendDialogueMessageRequest,
    emit: (event: DialogueStreamEvent) => void | Promise<void>,
    signal?: AbortSignal,
  ): Promise<void> {
    const turn = await this.createDialogueTurn(projectId, stepKey, input);
    this.activeStreamingAssistantMessageIds.add(turn.assistantMessage.id);
    try {
      await emit({
        type: "dialogue.message.created",
        threadId: turn.thread.id,
        messageId: turn.assistantMessage.id,
        thread: this.toThreadDto(turn.thread),
        userMessage: turn.userMessage,
        assistantMessage: turn.assistantMessage,
        createdAt: new Date().toISOString(),
      });

      const toolResults = await this.tryHandleScriptTools(turn, input, signal);
      if (toolResults.length > 0) {
        this.recordToolResults(turn.thread, toolResults);
        await this.persistToolResults(turn.thread, toolResults);
        await this.syncPendingArtifactsForThread(turn.thread.projectId, turn.thread.id, input.content);
        for (const toolResult of toolResults) {
          await emit({
            type: "dialogue.tool_result.created",
            threadId: turn.thread.id,
            messageId: turn.assistantMessage.id,
            thread: this.toThreadDto(turn.thread),
            assistantMessage: turn.assistantMessage,
            toolResult,
            createdAt: new Date().toISOString(),
          });
        }
        const lastResult = toolResults[toolResults.length - 1];
        this.completeAssistantMessage(turn, lastResult.summary, input.model ?? this.openCodeRuntimeService.getDefaultModel());
        await this.persistMessageUpdate(turn.assistantMessage);
        await emit({
          type: "dialogue.message.completed",
          threadId: turn.thread.id,
          messageId: turn.assistantMessage.id,
          thread: this.toThreadDto(turn.thread),
          assistantMessage: turn.assistantMessage,
          content: turn.assistantMessage.content,
          createdAt: new Date().toISOString(),
        });
        return;
      }

      const openCodeSessionId = await this.ensureOpenCodeSession(turn.thread, turn.snapshot, signal);
      const response = await this.openCodeRuntimeService.streamMessage(
        {
          sessionId: openCodeSessionId,
          model: input.model,
          content: turn.prompt,
          signal,
        },
        {
          onDelta: async (delta, content) => {
            turn.assistantMessage.content = content;
            turn.thread.updatedAt = new Date().toISOString();
            await emit({
              type: "dialogue.message.delta",
              threadId: turn.thread.id,
              messageId: turn.assistantMessage.id,
              delta,
              content,
              createdAt: new Date().toISOString(),
            });
          },
        },
      );
      this.completeAssistantMessage(turn, response.content, response.model);
      await this.persistMessageUpdate(turn.assistantMessage);
      await emit({
        type: "dialogue.message.completed",
        threadId: turn.thread.id,
        messageId: turn.assistantMessage.id,
        thread: this.toThreadDto(turn.thread),
        assistantMessage: turn.assistantMessage,
        content: turn.assistantMessage.content,
        createdAt: new Date().toISOString(),
      });
    } catch (error) {
      this.failAssistantMessage(turn, error);
      await this.persistMessageUpdate(turn.assistantMessage);
      await emit({
        type: "dialogue.error",
        threadId: turn.thread.id,
        messageId: turn.assistantMessage.id,
        thread: this.toThreadDto(turn.thread),
        assistantMessage: turn.assistantMessage,
        error: turn.assistantMessage.error ?? {
          code: "OPENCODE_DIALOGUE_FAILED",
          message: "OpenCode dialogue failed",
        },
        createdAt: new Date().toISOString(),
      });
    } finally {
      this.activeStreamingAssistantMessageIds.delete(turn.assistantMessage.id);
    }
  }

  private async createDialogueTurn(
    projectId: string,
    stepKey: string,
    input: SendDialogueMessageRequest,
  ): Promise<DialogueTurn> {
    await this.assertDatabaseProjectActive(projectId);
    const normalizedStepKey = this.normalizeStepKey(input.stepKey ?? stepKey);
    const chapterId = this.resolveDialogueChapterId(normalizedStepKey, input);
    const snapshot = await this.projectsService.getWorkbenchSnapshot(projectId, chapterId ?? undefined);
    const content = input.content.trim();
    if (!content) {
      throw new BadRequestException("DIALOGUE_MESSAGE_REQUIRED");
    }

    const thread = this.prismaService.isDatabaseMode()
      ? await this.getOrCreateDatabaseThread(projectId, normalizedStepKey, chapterId)
      : this.getOrCreateThread(projectId, normalizedStepKey, chapterId);
    this.settleInactiveRunningMessages(thread);
    const now = new Date().toISOString();
    const userMessage: DialogueMessageItem = {
      id: randomUUID(),
      projectId,
      threadId: thread.id,
      stepKey: normalizedStepKey,
      chapterId,
      role: "user",
      content,
      status: "completed",
      model: null,
      error: null,
      createdAt: now,
      completedAt: now,
    };
    const assistantMessage: DialogueMessageItem = {
      id: randomUUID(),
      projectId,
      threadId: thread.id,
      stepKey: normalizedStepKey,
      chapterId,
      role: "assistant",
      content: "",
      status: "running",
      model: input.model ?? this.openCodeRuntimeService.getDefaultModel(),
      error: null,
      createdAt: now,
      completedAt: null,
    };

    thread.messages.push(userMessage, assistantMessage);
    thread.updatedAt = now;

    if (this.prismaService.isDatabaseMode()) {
      await this.persistCreatedTurn(thread, userMessage, assistantMessage, input.model ?? this.openCodeRuntimeService.getDefaultModel());
    }

    return {
      snapshot,
      normalizedStepKey,
      thread,
      userMessage,
      assistantMessage,
      prompt: buildPrompt({
        snapshot,
        stepKey: normalizedStepKey,
        userContent: content,
        contextSourceText: input.context?.sourceText,
        attachmentText: formatAttachmentContext(input.attachments as { name: string; mimeType: string; content: string }[] | undefined),
        recentMessages: thread.messages.slice(-12),
      }),
    };
  }

  private completeAssistantMessage(
    turn: DialogueTurn,
    content: string,
    model: AIRuntimeModelSelection,
  ): void {
    turn.assistantMessage.content = content;
    turn.assistantMessage.model = model;
    turn.assistantMessage.status = "completed";
    turn.assistantMessage.completedAt = new Date().toISOString();
    turn.thread.updatedAt = turn.assistantMessage.completedAt;
  }

  private failAssistantMessage(turn: DialogueTurn, error: unknown): void {
    turn.assistantMessage.status = "failed";
    turn.assistantMessage.content = turn.assistantMessage.content || "OpenCode 对话失败，请检查本地 OpenCode 服务和模型配置后重试。";
    turn.assistantMessage.error = {
      code: "OPENCODE_DIALOGUE_FAILED",
      message: error instanceof Error ? error.message : "OpenCode dialogue failed",
    };
    turn.assistantMessage.completedAt = new Date().toISOString();
    turn.thread.updatedAt = turn.assistantMessage.completedAt;
  }

  private async ensureOpenCodeSession(thread: LocalDialogueThread, snapshot: WorkbenchSnapshot, signal?: AbortSignal): Promise<string> {
    if (thread.openCodeSessionId) {
      return thread.openCodeSessionId;
    }

    thread.openCodeSessionId = await this.openCodeRuntimeService.createSession(`${snapshot.project.name} · 对话框`, signal);
    thread.updatedAt = new Date().toISOString();
    if (this.prismaService.isDatabaseMode()) {
      const now = new Date();
      await this.prismaService.runBusinessTransaction(async (tx) => tx.dialogueRuntimeSession.create({
        data: {
          id: `dialogue_session_${randomUUID()}`,
          threadId: thread.id,
          runtime: "opencode",
          externalSessionId: thread.openCodeSessionId!,
          status: "active",
          providerId: this.openCodeRuntimeService.getDefaultModel().providerId,
          modelId: this.openCodeRuntimeService.getDefaultModel().modelId,
          variant: null,
          createdAt: now,
          updatedAt: now,
          closedAt: null,
        },
      }));
    }
    return thread.openCodeSessionId;
  }

  private async assertDatabaseProjectActive(projectId: string): Promise<void> {
    if (!this.prismaService.isDatabaseMode()) return;
    const project = await this.prismaService.database().project.findUnique({ where: { id: projectId }, select: { lifecycleStatus: true } });
    if (!project || project.lifecycleStatus !== "active") {
      throw new BadRequestException("PROJECT_NOT_FOUND");
    }
  }

  private async getOrCreateDatabaseThread(projectId: string, stepKey: string, chapterId: string | null): Promise<LocalDialogueThread> {
    const db = this.prismaService.database();
    const scopeKey = chapterId ? `chapter:${chapterId}` : "project";
    const now = new Date();
    const row = await this.prismaService.runBusinessTransaction(async (tx) => tx.conversationThread.upsert({
      where: { projectId_stepKey_scopeKey: { projectId, stepKey, scopeKey } },
      create: { id: `dialogue_thread_${randomUUID()}`, projectId, chapterId, stepKey, scopeKey, title: stepKey, status: "active", createdAt: now, updatedAt: now },
      update: { updatedAt: now },
    }));
    const [messages, toolResults, session, pendingArtifacts] = await Promise.all([
      db.conversationMessage.findMany({ where: { threadId: row.id }, orderBy: { createdAt: "asc" } }),
      db.dialogueToolResult.findMany({ where: { threadId: row.id }, orderBy: { createdAt: "asc" } }),
      db.dialogueRuntimeSession.findFirst({ where: { threadId: row.id, status: "active" }, orderBy: { createdAt: "desc" } }),
      db.pendingDialogueArtifact.findMany({ where: { threadId: row.id, status: "pending" }, orderBy: { createdAt: "asc" } }),
    ]);
    const existing = this.threads.get(getThreadKey(projectId, stepKey, chapterId));
    const thread: LocalDialogueThread = existing ?? {
      id: row.id,
      projectId,
      stepKey,
      chapterId,
      openCodeSessionId: session?.externalSessionId ?? null,
      messages: [],
      toolResults: [],
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
    thread.id = row.id;
    thread.openCodeSessionId = session?.externalSessionId ?? null;
    thread.createdAt = row.createdAt.toISOString();
    thread.updatedAt = row.updatedAt.toISOString();
    thread.messages = messages.map((message) => ({
      id: message.id,
      projectId,
      threadId: row.id,
      stepKey,
      chapterId,
      role: message.role === "user" ? "user" : "assistant",
      content: message.content,
      status: message.status as DialogueMessageItem["status"],
      model: message.providerId && message.modelId ? { providerId: message.providerId, modelId: message.modelId } : null,
      error: message.errorJson && typeof message.errorJson === "object" && !Array.isArray(message.errorJson) ? message.errorJson as DialogueMessageItem["error"] : null,
      createdAt: message.createdAt.toISOString(),
      completedAt: message.completedAt?.toISOString() ?? null,
    }));
    thread.toolResults = toolResults.map((result) => result.payloadJson as unknown as DialogueToolResult);
    for (const artifact of pendingArtifacts) {
      if (digestCanonicalJson(artifact.payloadJson) !== artifact.payloadDigest) continue;
      this.scriptDialogue.restorePendingArtifact({ id: artifact.id, projectId: artifact.projectId, chapterId: artifact.chapterId, threadId: artifact.threadId, kind: artifact.kind as PendingDialogueCaptureArtifact["kind"], status: "pending", activeSlotKey: artifact.activeSlotKey!, payload: artifact.payloadJson, schemaVersion: 1, createdAt: artifact.createdAt.toISOString(), updatedAt: artifact.updatedAt.toISOString() });
    }
    this.threads.set(getThreadKey(projectId, stepKey, chapterId), thread);
    return thread;
  }

  private async settleDatabaseRunningMessages(threadId: string): Promise<void> {
    const db = this.prismaService.database();
    const activeIds = this.activeStreamingAssistantMessageIds;
    const running = await db.conversationMessage.findMany({ where: { threadId, status: "running" } });
    if (running.some((message) => activeIds.has(message.id))) return;
    const now = new Date();
    await this.prismaService.runBusinessTransaction(async (tx) => {
      for (const message of running) {
        await tx.conversationMessage.update({ where: { id: message.id }, data: { status: "failed", content: message.content || "上一轮对话连接已中断，请重新发送。", errorJson: { code: "DIALOGUE_STREAM_INTERRUPTED", message: "Dialogue stream was interrupted before completion." }, errorSchemaVersion: 1, completedAt: now, updatedAt: now } });
      }
      await tx.dialogueRuntimeSession.updateMany({ where: { threadId, status: "active" }, data: { status: "closed", closedAt: now, updatedAt: now } });
    });
  }

  private async persistCreatedTurn(thread: LocalDialogueThread, userMessage: DialogueMessageItem, assistantMessage: DialogueMessageItem, model: AIRuntimeModelSelection): Promise<void> {
    const now = new Date(userMessage.createdAt);
    await this.prismaService.runBusinessTransaction(async (tx) => {
      await tx.conversationMessage.create({ data: { id: userMessage.id, threadId: thread.id, role: "user", content: userMessage.content, status: "completed", providerId: null, modelId: null, errorJson: undefined, errorSchemaVersion: null, createdAt: now, updatedAt: now, completedAt: now } });
      await tx.conversationMessage.create({ data: { id: assistantMessage.id, threadId: thread.id, role: "assistant", content: "", status: "running", providerId: model.providerId, modelId: model.modelId, errorJson: undefined, errorSchemaVersion: null, createdAt: now, updatedAt: now, completedAt: null } });
      await tx.conversationThread.update({ where: { id: thread.id }, data: { updatedAt: now } });
    });
  }

  private async persistMessageUpdate(message: DialogueMessageItem): Promise<void> {
    if (!this.prismaService.isDatabaseMode()) return;
    const redactedError = message.error ? redactCredentials(message.error).value : Prisma.DbNull;
    await this.prismaService.runBusinessTransaction(async (tx) => tx.conversationMessage.update({ where: { id: message.id }, data: { content: message.content, status: message.status, providerId: message.model?.providerId ?? null, modelId: message.model?.modelId ?? null, errorJson: redactedError as Prisma.InputJsonValue | typeof Prisma.DbNull, errorSchemaVersion: message.error ? 1 : null, completedAt: message.completedAt ? new Date(message.completedAt) : null, updatedAt: new Date() } }));
  }

  private async persistToolResults(thread: LocalDialogueThread, results: DialogueToolResult[]): Promise<void> {
    if (!this.prismaService.isDatabaseMode()) return;
    await this.prismaService.runBusinessTransaction(async (tx) => {
      for (const result of results) {
        const redacted = redactCredentials(result).value as DialogueToolResult;
        await tx.dialogueToolResult.upsert({
          where: { threadId_toolCallId: { threadId: thread.id, toolCallId: result.toolCallId } },
          create: { id: result.id, threadId: thread.id, messageId: result.messageId, toolCallId: result.toolCallId, tool: result.tool, status: result.status, summary: redacted.summary, payloadJson: redacted as unknown as Prisma.InputJsonValue, schemaVersion: 1, payloadDigest: digestCanonicalJson(redacted), createdAt: new Date(result.createdAt) },
          update: { payloadJson: redacted as unknown as Prisma.InputJsonValue, status: result.status, summary: redacted.summary, payloadDigest: digestCanonicalJson(redacted) },
        });
      }
    });
  }

  private async syncPendingArtifactsForThread(projectId: string, threadId: string, inputContent: string): Promise<void> {
    if (!this.prismaService.isDatabaseMode()) return;
    const artifacts = this.scriptDialogue.capturePendingArtifacts(this.threads).filter((artifact) => artifact.projectId === projectId && artifact.threadId === threadId);
    const currentIds = new Set(artifacts.map((artifact) => artifact.id));
    const threadChapterId = this.threads.get(threadId)?.chapterId ?? null;
    const resolutionStatus = /(取消|不要|先不|不生成|别生成|算了)/.test(inputContent.trim()) ? "discarded" : "applied";
    const resolvedAt = new Date();
    await this.prismaService.runBusinessTransaction(async (tx) => {
      for (const artifact of artifacts) {
        const redacted = redactCredentials(artifact.payload).value;
        await tx.pendingDialogueArtifact.upsert({
          where: { id: artifact.id },
          create: { id: artifact.id, projectId: artifact.projectId, chapterId: threadChapterId, threadId: artifact.threadId, kind: artifact.kind, status: "pending", activeSlotKey: artifact.activeSlotKey, payloadJson: redacted as Prisma.InputJsonValue, schemaVersion: artifact.schemaVersion, payloadDigest: digestCanonicalJson(redacted), sourceMessageId: null, toolResultId: null, createdAt: new Date(artifact.createdAt), updatedAt: new Date(artifact.updatedAt), resolvedAt: null },
          update: { payloadJson: redacted as Prisma.InputJsonValue, payloadDigest: digestCanonicalJson(redacted), updatedAt: new Date(artifact.updatedAt), status: "pending", activeSlotKey: artifact.activeSlotKey, resolvedAt: null },
        });
      }
      const stale = await tx.pendingDialogueArtifact.findMany({ where: { projectId, threadId, status: "pending" } });
      for (const artifact of stale) {
        if (currentIds.has(artifact.id)) continue;
        await tx.pendingDialogueArtifact.update({ where: { id: artifact.id }, data: { status: resolutionStatus, activeSlotKey: null, resolvedAt, updatedAt: resolvedAt } });
      }
    });
  }

  private getOrCreateThread(projectId: string, stepKey: string, chapterId: string | null): LocalDialogueThread {
    const threadKey = getThreadKey(projectId, stepKey, chapterId);
    const existing = this.threads.get(threadKey);
    if (existing) {
      return existing;
    }

    const now = new Date().toISOString();
    const thread: LocalDialogueThread = {
      id: randomUUID(),
      projectId,
      stepKey,
      chapterId,
      openCodeSessionId: null,
      messages: [],
      toolResults: [],
      createdAt: now,
      updatedAt: now,
    };
    this.threads.set(threadKey, thread);
    return thread;
  }

  private settleInactiveRunningMessages(thread: LocalDialogueThread): void {
    const now = new Date().toISOString();
    let changed = false;

    for (const message of thread.messages) {
      if (
        message.role !== "assistant"
        || message.status !== "running"
        || this.activeStreamingAssistantMessageIds.has(message.id)
      ) {
        continue;
      }

      message.status = "failed";
      message.content = message.content || "上一轮对话连接已中断，请重新发送。";
      message.error = {
        code: "DIALOGUE_STREAM_INTERRUPTED",
        message: "Dialogue stream was interrupted before completion.",
      };
      message.completedAt = now;
      changed = true;
    }

    if (changed) {
      thread.updatedAt = now;
    }
  }

  private deleteProjectRuntimeState(projectId: string): number {
    let deletedCount = 0;
    const deletedThreadIds = new Set<string>();

    for (const [threadKey, thread] of this.threads.entries()) {
      if (thread.projectId !== projectId) {
        continue;
      }

      deletedThreadIds.add(thread.id);
      for (const message of thread.messages) {
        this.activeStreamingAssistantMessageIds.delete(message.id);
      }
      this.threads.delete(threadKey);
      deletedCount += 1;
    }

    for (const threadId of deletedThreadIds) {
      if (this.scriptDialogue.tryDeleteThreadState(threadId)) {
        deletedCount += 1;
      }
    }

    deletedCount += this.scriptDialogue.clearForProject(projectId);
    deletedCount += this.storyStructureDialogue.clearForProject(projectId);
    return deletedCount;
  }

  private toThreadDto(thread: LocalDialogueThread): DialogueThread {
    return {
      id: thread.id,
      projectId: thread.projectId,
      currentStepKey: thread.stepKey,
      chapterId: thread.chapterId,
      messages: thread.messages,
      toolResults: thread.toolResults,
      createdAt: thread.createdAt,
      updatedAt: thread.updatedAt,
    };
  }

  private recordToolResults(thread: LocalDialogueThread, toolResults: DialogueToolResult[]): void {
    const existingIds = new Set(thread.toolResults.map((result) => result.id));
    const nextResults = toolResults.filter((result) => !existingIds.has(result.id));
    if (nextResults.length === 0) {
      return;
    }

    thread.toolResults.push(...nextResults);
    thread.updatedAt = new Date().toISOString();
  }

  private normalizeStepKey(stepKey: string): string {
    if (stepKey === "story") {
      return "project_story";
    }

    return STEP_LABELS[stepKey] ? stepKey : "project_story";
  }

  private resolveDialogueChapterId(stepKey: string, input: SendDialogueMessageRequest): string | null {
    if (stepKey === "project_characters") {
      return null;
    }

    if (stepKey !== "project_story") {
      return input.chapterId ?? null;
    }

    return shouldOrganizeProvidedScript(input)
      || input.intent === "generate_inspiration_seeds"
      || input.intent === "generate_script_outline_from_seed"
      ? null
      : input.chapterId ?? null;
  }

  private async tryHandleScriptTools(
    turn: DialogueTurn,
    input: SendDialogueMessageRequest,
    signal?: AbortSignal,
  ): Promise<DialogueToolResult[]> {
    const projectCharactersResult = await this.tryHandleProjectCharacterTools(turn, input);
    if (projectCharactersResult) {
      return [projectCharactersResult];
    }

    const storyStructureResult = await this.storyStructureDialogue.handleStoryStructureTurn(turn, input, signal);
    if (storyStructureResult) {
      return [storyStructureResult];
    }

    const storyboardResult = await this.storyboardDialogue.handleStoryboardTurn(turn, input, signal);
    if (storyboardResult) {
      return [storyboardResult];
    }

    const scriptResults = await this.scriptDialogue.handleScriptTurn(turn, input, signal);
    if (scriptResults.length > 0) {
      return scriptResults;
    }

    return [];
  }

  private async tryHandleProjectCharacterTools(
    turn: DialogueTurn,
    input: SendDialogueMessageRequest,
  ): Promise<DialogueToolResult | null> {
    if (turn.normalizedStepKey !== "project_characters") {
      return null;
    }

    if (!shouldGenerateProjectCharacters(input)) {
      return null;
    }

    const result = await this.projectsService.extractProjectCharacters(turn.thread.projectId, {
      source: "auto",
    });
    if (result.characters.length === 0) {
      return this.createFailedToolResult(
        turn,
        "generate_project_characters",
        "我没有从已确认剧本大纲或当前章节里识别出可入库角色。可以先在剧本阶段确认大纲，或把主要角色设定发给我再提取。",
      );
    }

    const requiredCount = result.characters.filter((character) =>
      character.level === "lead" || character.level === "recurring",
    ).length;
    return {
      id: randomUUID(),
      projectId: turn.thread.projectId,
      threadId: turn.thread.id,
      messageId: turn.assistantMessage.id,
      toolCallId: randomUUID(),
      tool: "generate_project_characters",
      status: "succeeded",
      summary: [
        `已提取 ${result.characters.length} 个项目角色，其中 ${requiredCount} 个需要确认角色定稿图。`,
        "右侧项目角色库会自动生成角色预览图；主角/常驻角色确认预览并完成定稿后，会在出图准备阶段作为候选图生成的参考图。",
      ].join("\n"),
      chapters: turn.snapshot.chapters,
      currentChapterId: turn.snapshot.currentChapter?.id ?? null,
      currentChapter: turn.snapshot.currentChapter ?? null,
      characters: result.characters,
      revision: null,
      createdAt: new Date().toISOString(),
    };
  }

  private createFailedToolResult(
    turn: DialogueTurn,
    tool: DialogueToolResult["tool"],
    summary: string,
  ): DialogueToolResult {
    return {
      id: randomUUID(),
      projectId: turn.thread.projectId,
      threadId: turn.thread.id,
      messageId: turn.assistantMessage.id,
      toolCallId: randomUUID(),
      tool,
      status: "failed",
      summary,
      chapters: [],
      currentChapterId: turn.snapshot.currentChapter?.id ?? turn.thread.chapterId,
      currentChapter: turn.snapshot.currentChapter ?? null,
      analysis: null,
      inspirationSeeds: null,
      scriptOutline: null,
      revision: null,
      createdAt: new Date().toISOString(),
    };
  }
}
