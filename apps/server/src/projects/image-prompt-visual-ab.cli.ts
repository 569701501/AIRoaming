import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import type { ImageProviderType } from "@airoaming/shared";
import type { RuntimeImageProviderSettings } from "../settings/settings.service.js";
import { SettingsService } from "../settings/settings.service.js";
import { SecretStoreService } from "../settings/secret-store.js";
import {
  compileImagePromptBaseline,
  parseImagePromptBaselineSuite,
  type ImagePromptBaselineReport,
} from "./image-prompt-baseline.util.js";
import {
  detectImageMimeType,
  getImageAspectRatioWarning,
  readImageDimensions,
} from "./image-dimensions.util.js";
import {
  ImageProviderService,
  type CandidateImageReferenceInput,
} from "./image-provider.service.js";
import {
  createVisualAbLedger,
  extensionForMime,
  providerSize,
  shouldStopProviderAfterFailure,
  summarizeVisualAbLedger,
  VISUAL_AB_EVALUATION_POLICY,
  visualAbPlanDigest,
  type VisualAbLedger,
  type VisualAbSlot,
} from "./image-prompt-visual-ab.util.js";

interface StoredProviderSettings {
  providerId: string;
  modelId: string;
  baseUrl: string | null;
  secretRef?: string | null;
  keyFingerprint?: string | null;
}

interface StoredSettings {
  openaiImageProvider: StoredProviderSettings;
  doubaoImageProvider: StoredProviderSettings;
  grokImageProvider: StoredProviderSettings;
}

interface ReferenceManifestItem {
  assetId: string;
  file: string;
  mimeType: "image/png" | "image/jpeg" | "image/webp";
  sha256: string;
  dimensions: { width: number; height: number } | null;
}

interface AttemptResult {
  slotId: string;
  promptVersion: "v1" | "v2";
  providerType: ImageProviderType;
  caseId: string;
  variant: number;
  status: "completed" | "failed" | "skipped" | "manual_review_required";
  startedAt?: string;
  finishedAt: string;
  providerRequestIssued: boolean;
  profileId?: string;
  requestedSize?: { width: number; height: number };
  providerSize?: string;
  requestedReferenceAssetIds?: string[];
  usedReferenceAssetIds?: string[];
  generationMode?: string;
  warnings?: string[];
  outputFile?: string;
  outputMimeType?: string;
  outputSha256?: string;
  outputBytes?: number;
  actualDimensions?: { width: number; height: number } | null;
  error?: string;
  reason?: string;
}

const PROVIDERS: ImageProviderType[] = ["openai", "doubao", "grok"];
const REFERENCE_ASSET_IDS = [
  "asset_lin_preview",
  "asset_xu_preview",
  "asset_zhao_preview",
  "asset_gao_preview",
  "asset_scene_port",
  "asset_scene_archive",
] as const;

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function hasFlag(name: string): boolean {
  return process.argv.includes(name);
}

function requiredPromptVersion(): "v1" | "v2" {
  const value = arg("--prompt-version");
  if (value !== "v1" && value !== "v2") {
    throw new Error("VISUAL_AB_PROMPT_VERSION_REQUIRED:v1|v2");
  }
  return value;
}

function safeError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/Bearer\s+[^\s]+/gi, "Bearer [REDACTED]").slice(0, 500);
}

function storedProvider(settings: StoredSettings, providerType: ImageProviderType): StoredProviderSettings {
  if (providerType === "openai") return settings.openaiImageProvider;
  if (providerType === "doubao") return settings.doubaoImageProvider;
  return settings.grokImageProvider;
}

function credentialId(providerType: ImageProviderType, providerId: string): string {
  return `image_${providerType}_${providerId}`;
}

async function writeJsonAtomically(filePath: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.${randomUUID()}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  await rename(temporary, filePath);
}

async function prepareReferences(referenceDir: string, outputDir: string): Promise<Map<string, ReferenceManifestItem>> {
  const manifest = new Map<string, ReferenceManifestItem>();
  for (const assetId of REFERENCE_ASSET_IDS) {
    const filePath = path.join(referenceDir, `${assetId}.png`);
    const buffer = await readFile(filePath);
    const mimeType = detectImageMimeType(buffer);
    if (!mimeType) throw new Error(`VISUAL_AB_REFERENCE_IMAGE_INVALID:${assetId}`);
    manifest.set(assetId, {
      assetId,
      file: path.relative(outputDir, filePath),
      mimeType,
      sha256: createHash("sha256").update(buffer).digest("hex"),
      dimensions: readImageDimensions(buffer),
    });
  }
  await writeJsonAtomically(path.join(outputDir, "reference-manifest.json"), {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    references: [...manifest.values()],
  });
  return manifest;
}

async function readOrCreateLedger(
  ledgerPath: string,
  report: ImagePromptBaselineReport,
): Promise<VisualAbLedger> {
  let ledger: VisualAbLedger;
  try {
    ledger = JSON.parse(await readFile(ledgerPath, "utf8")) as VisualAbLedger;
  } catch (error) {
    if (!(error && typeof error === "object" && "code" in error && error.code === "ENOENT")) throw error;
    ledger = createVisualAbLedger(report);
  }
  const expected = visualAbPlanDigest(report, createVisualAbLedger(report).slots);
  if (
    ledger.schemaVersion !== 2
    || ledger.suiteId !== report.suiteId
    || ledger.promptVersion !== report.productionBaseline.promptVersion
    || ledger.planDigest !== expected
  ) {
    throw new Error("VISUAL_AB_LEDGER_PLAN_MISMATCH");
  }
  const now = new Date().toISOString();
  for (const slot of ledger.slots) {
    if (slot.status === "started") slot.status = "manual_review_required";
  }
  ledger.updatedAt = now;
  await writeJsonAtomically(ledgerPath, ledger);
  return ledger;
}

function candidateFor(report: ImagePromptBaselineReport, slot: VisualAbSlot) {
  const candidate = report.candidateCases.find((item) => item.caseId === slot.caseId);
  if (!candidate) throw new Error(`VISUAL_AB_CASE_MISSING:${slot.caseId}`);
  const profile = candidate.providerProfiles.find((item) => item.providerType === slot.providerType);
  if (!profile) throw new Error(`VISUAL_AB_PROFILE_MISSING:${slot.slotId}`);
  return { candidate, profile };
}

async function loadReferences(
  candidate: ImagePromptBaselineReport["candidateCases"][number],
  referenceDir: string,
  manifest: Map<string, ReferenceManifestItem>,
): Promise<CandidateImageReferenceInput[]> {
  return Promise.all(candidate.generationSpec.references.map(async (reference) => {
    const item = manifest.get(reference.assetId);
    if (!item) throw new Error(`VISUAL_AB_REFERENCE_MANIFEST_MISSING:${reference.assetId}`);
    const filePath = path.resolve(referenceDir, `${reference.assetId}.png`);
    return {
      assetId: reference.assetId,
      kind: reference.kind,
      label: reference.label,
      priority: reference.priority,
      buffer: await readFile(filePath),
      mimeType: item.mimeType,
      fileName: path.basename(filePath),
      sourceReferenceKind: reference.kind === "character_identity" ? "preview_front" : "scene_background",
    };
  }));
}

async function writeReport(
  outputDir: string,
  report: ImagePromptBaselineReport,
  ledger: VisualAbLedger,
  settings: StoredSettings,
  results: AttemptResult[],
): Promise<void> {
  const providerMetadata = Object.fromEntries(PROVIDERS.map((providerType) => {
    const stored = storedProvider(settings, providerType);
    return [providerType, {
      providerId: stored.providerId,
      modelId: stored.modelId,
      baseUrl: stored.baseUrl,
      credentialConfigured: Boolean(stored.secretRef && stored.keyFingerprint),
    }];
  }));
  const promptManifest = report.candidateCases.flatMap((candidate) =>
    candidate.providerProfiles.map((profile) => ({
      promptVersion: report.productionBaseline.promptVersion,
      caseId: candidate.caseId,
      providerType: profile.providerType,
      profileId: profile.profileId,
      promptSha256: createHash("sha256").update(profile.prompt, "utf8").digest("hex"),
      promptLength: profile.prompt.length,
    })),
  );
  await writeJsonAtomically(path.join(outputDir, "run-report.json"), {
    schemaVersion: 1,
    suiteId: report.suiteId,
    promptVersion: report.productionBaseline.promptVersion,
    planDigest: ledger.planDigest,
    generatedAt: new Date().toISOString(),
    requestPolicy: {
      maxProviderRequests: 30,
      failedRequestsConsumeSlot: true,
      automaticRetry: false,
      providerSwitchOnFailure: false,
      activeProviderMutated: false,
      formalProjectDataMutated: false,
    },
    evaluationPolicy: VISUAL_AB_EVALUATION_POLICY,
    promptManifest,
    providerMetadata,
    ledgerSummary: summarizeVisualAbLedger(ledger),
    issuedProviderRequestCount: results.filter((item) => item.providerRequestIssued).length,
    results,
  });
}

function markRemainingProviderSlotsSkipped(
  ledger: VisualAbLedger,
  providerType: ImageProviderType,
  reason: string,
  results: AttemptResult[],
): void {
  const now = new Date().toISOString();
  for (const slot of ledger.slots) {
    if (slot.providerType !== providerType || slot.status !== "pending") continue;
    slot.status = "skipped";
    results.push({
      slotId: slot.slotId,
      promptVersion: slot.promptVersion,
      providerType: slot.providerType,
      caseId: slot.caseId,
      variant: slot.variant,
      status: "skipped",
      finishedAt: now,
      providerRequestIssued: false,
      reason,
    });
  }
}

async function main(): Promise<void> {
  const defaultFixture = fileURLToPath(new URL("../../../../tests/fixtures/image-prompt/s4-baseline-v1.json", import.meta.url));
  const workspaceRoot = path.resolve(fileURLToPath(new URL("../../../../", import.meta.url)));
  const promptVersion = requiredPromptVersion();
  const defaultOutputDir = path.join(
    workspaceRoot,
    `文档/05_执行与记录/任务记录/2026-07-17_图片提示词专业化/evidence/runtime/${promptVersion}`,
  );
  const fixturePath = path.resolve(arg("--fixture") ?? defaultFixture);
  const outputDir = path.resolve(arg("--output-dir") ?? defaultOutputDir);
  const referenceDir = path.resolve(arg("--reference-dir") ?? path.join(
    workspaceRoot,
    "文档/05_执行与记录/任务记录/2026-07-17_真实图片AB/evidence/references",
  ));
  const settingsPath = path.resolve(arg("--settings") ?? path.join(workspaceRoot, "workspace/settings/app-settings.json"));
  const execute = hasFlag("--execute");
  const selectedProviders = arg("--providers")?.split(",").filter(Boolean) as ImageProviderType[] | undefined;
  const providerFilter = selectedProviders?.length ? selectedProviders : PROVIDERS;
  if (providerFilter.some((provider) => !PROVIDERS.includes(provider))) {
    throw new Error("VISUAL_AB_PROVIDER_FILTER_INVALID");
  }

  const suite = parseImagePromptBaselineSuite(JSON.parse(await readFile(fixturePath, "utf8")) as unknown);
  const report = compileImagePromptBaseline(suite, { promptVersion });
  if (!report.summary.passed) throw new Error("VISUAL_AB_BASELINE_NOT_PASSED");
  await mkdir(outputDir, { recursive: true });
  const referenceManifest = await prepareReferences(referenceDir, outputDir);
  const settings = JSON.parse(await readFile(settingsPath, "utf8")) as StoredSettings;
  const ledgerPath = path.join(outputDir, "attempt-ledger.json");
  const ledger = await readOrCreateLedger(ledgerPath, report);
  const reportPath = path.join(outputDir, "run-report.json");
  let results: AttemptResult[] = [];
  try {
    const existing = JSON.parse(await readFile(reportPath, "utf8")) as { results?: AttemptResult[] };
    results = existing.results ?? [];
  } catch (error) {
    if (!(error && typeof error === "object" && "code" in error && error.code === "ENOENT")) throw error;
  }
  for (const slot of ledger.slots) {
    if (slot.status === "manual_review_required" && !results.some((item) => item.slotId === slot.slotId)) {
      results.push({
        slotId: slot.slotId,
        promptVersion: slot.promptVersion,
        providerType: slot.providerType,
        caseId: slot.caseId,
        variant: slot.variant,
        status: "manual_review_required",
        finishedAt: new Date().toISOString(),
        providerRequestIssued: true,
        reason: "previous_process_ended_after_request_slot_started; automatic retry forbidden",
      });
    }
  }
  await writeReport(outputDir, report, ledger, settings, results);

  if (!execute) {
    process.stdout.write(`${JSON.stringify({
      mode: "dry-run",
      promptVersion,
      outputDir,
      referenceCount: referenceManifest.size,
      ledgerSummary: summarizeVisualAbLedger(ledger),
      next: `After explicit cost authorization, pass --prompt-version ${promptVersion} --execute to issue at most 30 provider requests.`,
    }, null, 2)}\n`);
    return;
  }

  const secretStore = new SecretStoreService();
  for (const providerType of PROVIDERS) {
    if (!providerFilter.includes(providerType)) continue;
    const pending = ledger.slots.filter((slot) => slot.providerType === providerType && slot.status === "pending");
    if (pending.length === 0) continue;
    const stored = storedProvider(settings, providerType);
    let apiKey: string;
    try {
      apiKey = (await secretStore.get(credentialId(providerType, stored.providerId))).reveal();
    } catch (error) {
      markRemainingProviderSlotsSkipped(ledger, providerType, `credential_unavailable:${safeError(error)}`, results);
      ledger.updatedAt = new Date().toISOString();
      await writeJsonAtomically(ledgerPath, ledger);
      await writeReport(outputDir, report, ledger, settings, results);
      continue;
    }
    const runtime: RuntimeImageProviderSettings = {
      type: providerType,
      providerId: stored.providerId,
      modelId: stored.modelId,
      baseUrl: stored.baseUrl,
      apiKey,
    };
    const facade = { getRuntimeImageProviderSettings: () => runtime } as SettingsService;
    const service = new ImageProviderService(facade);

    for (const slot of pending) {
      const { candidate, profile } = candidateFor(report, slot);
      const requestedSize = candidate.generationSpec.requestedSize;
      const size = providerSize(requestedSize, providerType);
      const references = await loadReferences(candidate, referenceDir, referenceManifest);
      const startedAt = new Date().toISOString();
      slot.status = "started";
      ledger.updatedAt = startedAt;
      await writeJsonAtomically(ledgerPath, ledger);
      process.stdout.write(`${JSON.stringify({ event: "request_started", promptVersion, slotId: slot.slotId, providerType, caseId: slot.caseId, variant: slot.variant })}\n`);
      try {
        const providerResult = await service.generateCandidateImage({
          prompt: profile.prompt,
          size,
          references,
          quality: "high",
          outputFormat: "webp",
        });
        const mimeType = detectImageMimeType(providerResult.buffer);
        if (!mimeType) throw new Error("VISUAL_AB_PROVIDER_OUTPUT_NOT_IMAGE");
        const extension = extensionForMime(mimeType);
        const outputFile = path.join(providerType, slot.caseId, `v${slot.variant}.${extension}`);
        const absoluteOutput = path.join(outputDir, outputFile);
        await mkdir(path.dirname(absoluteOutput), { recursive: true });
        await writeFile(absoluteOutput, providerResult.buffer, { mode: 0o600 });
        const actualDimensions = readImageDimensions(providerResult.buffer);
        const aspectWarning = getImageAspectRatioWarning(requestedSize, actualDimensions);
        slot.status = "completed";
        results = results.filter((item) => item.slotId !== slot.slotId);
        results.push({
          slotId: slot.slotId,
          promptVersion: slot.promptVersion,
          providerType,
          caseId: slot.caseId,
          variant: slot.variant,
          status: "completed",
          startedAt,
          finishedAt: new Date().toISOString(),
          providerRequestIssued: true,
          profileId: profile.profileId,
          requestedSize,
          providerSize: size,
          requestedReferenceAssetIds: references.map((reference) => reference.assetId),
          usedReferenceAssetIds: providerResult.usedReferenceAssetIds,
          generationMode: providerResult.generationMode,
          warnings: [...providerResult.warnings, ...(aspectWarning ? [aspectWarning] : [])],
          outputFile,
          outputMimeType: mimeType,
          outputSha256: createHash("sha256").update(providerResult.buffer).digest("hex"),
          outputBytes: providerResult.buffer.length,
          actualDimensions,
        });
        process.stdout.write(`${JSON.stringify({ event: "request_completed", slotId: slot.slotId, outputFile, actualDimensions })}\n`);
      } catch (error) {
        const message = safeError(error);
        slot.status = "failed";
        results = results.filter((item) => item.slotId !== slot.slotId);
        results.push({
          slotId: slot.slotId,
          promptVersion: slot.promptVersion,
          providerType,
          caseId: slot.caseId,
          variant: slot.variant,
          status: "failed",
          startedAt,
          finishedAt: new Date().toISOString(),
          providerRequestIssued: true,
          profileId: profile.profileId,
          requestedSize,
          providerSize: size,
          requestedReferenceAssetIds: references.map((reference) => reference.assetId),
          error: message,
        });
        process.stdout.write(`${JSON.stringify({ event: "request_failed", slotId: slot.slotId, error: message })}\n`);
        if (shouldStopProviderAfterFailure(message)) {
          markRemainingProviderSlotsSkipped(ledger, providerType, `provider_stopped_after_failure:${slot.slotId}`, results);
        }
      }
      ledger.updatedAt = new Date().toISOString();
      await writeJsonAtomically(ledgerPath, ledger);
      await writeReport(outputDir, report, ledger, settings, results);
      if (ledger.slots.some((item) => item.providerType === providerType && item.status === "skipped")) break;
    }
  }

  process.stdout.write(`${JSON.stringify({
    mode: "execute",
    promptVersion,
    outputDir,
    ledgerSummary: summarizeVisualAbLedger(ledger),
    issuedProviderRequestCount: results.filter((item) => item.providerRequestIssued).length,
  }, null, 2)}\n`);
}

await main();
