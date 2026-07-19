import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WorkspacePathService } from "../workspace/workspace-path.service.js";
import { ImageProviderService } from "./image-provider.service.js";
import { PersistentTaskWorkerService } from "./persistent-task-worker.service.js";

const ONE_PIXEL_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);

describe("PersistentTaskWorkerService image reference path", () => {
  let root: string | null = null;

  afterEach(async () => {
    vi.unstubAllGlobals();
    delete process.env.AIROAMING_WORKSPACE_ROOT;
    if (root) await rm(root, { recursive: true, force: true });
    root = null;
  });

  it("DB-only worker 把三角色与场景完整交给同一编译器并返回覆盖证据", async () => {
    root = await mkdtemp(path.join(tmpdir(), "airoaming-db-candidate-refs-"));
    process.env.AIROAMING_WORKSPACE_ROOT = root;
    const rows = await Promise.all([
      createAsset(root, "character_a"),
      createAsset(root, "character_b"),
      createAsset(root, "character_c"),
      createAsset(root, "scene_a"),
    ]);
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      data: [{ b64_json: ONE_PIXEL_PNG.toString("base64") }],
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    const imageProvider = new ImageProviderService({
      getRuntimeImageProviderSettings: () => ({
        type: "grok",
        apiKey: "test-key",
        baseUrl: "https://api.x.ai/v1",
        modelId: "grok-imagine-image-quality",
      }),
    } as never);
    const service = worker({ asset: { findMany: vi.fn().mockResolvedValue(rows) } }, imageProvider);

    const output = await runImageProvider(service, promptInput([
      source("character_a", "character_identity", "preview_front"),
      source("character_b", "character_identity", "preview_front"),
      source("character_c", "character_identity", "preview_front"),
      source("scene_a", "scene_environment", "scene_background"),
    ]));

    expect(output.candidates[0]?.referencePlan).toMatchObject({
      strategy: "cast_identity_board",
      usedReferenceAssetIds: ["character_a", "character_b", "character_c", "scene_a"],
      omittedRequired: [],
      slots: [
        { role: "cast_identity_board", covers: ["character_a", "character_b", "character_c"] },
        { role: "scene_environment", covers: ["scene_a"] },
      ],
    });
    const body = JSON.parse(String((fetchMock.mock.calls[0]?.[1] as RequestInit).body)) as { images: unknown[] };
    expect(body.images).toHaveLength(2);
  });

  it("DB-only 冻结 Asset 缺失时在网络调用前失败", async () => {
    root = await mkdtemp(path.join(tmpdir(), "airoaming-db-candidate-refs-"));
    process.env.AIROAMING_WORKSPACE_ROOT = root;
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const imageProvider = new ImageProviderService({
      getRuntimeImageProviderSettings: () => ({
        type: "grok",
        apiKey: "test-key",
        baseUrl: "https://api.x.ai/v1",
        modelId: "grok-imagine-image-quality",
      }),
    } as never);
    const service = worker({ asset: { findMany: vi.fn().mockResolvedValue([]) } }, imageProvider);

    await expect(runImageProvider(service, promptInput([
      source("character_missing", "character_identity", "preview_front"),
    ]))).rejects.toThrow("CANDIDATE_REQUIRED_REFERENCE_ASSET_MISSING:character_missing");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("DB-only 旧任务未带来源类型且只指向四视图时失败关闭", async () => {
    root = await mkdtemp(path.join(tmpdir(), "airoaming-db-candidate-refs-"));
    process.env.AIROAMING_WORKSPACE_ROOT = root;
    const row = {
      ...await createAsset(root, "character_final"),
      characterVisualByAsset: { kind: "final_reference" },
    };
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      data: [{ b64_json: ONE_PIXEL_PNG.toString("base64") }],
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    const imageProvider = new ImageProviderService({
      getRuntimeImageProviderSettings: () => ({
        type: "grok",
        apiKey: "test-key",
        baseUrl: "https://api.x.ai/v1",
        modelId: "grok-imagine-image-quality",
      }),
    } as never);
    const service = worker({ asset: { findMany: vi.fn().mockResolvedValue([row]) } }, imageProvider);

    await expect(runImageProvider(service, promptInput([{
      assetId: "character_final",
      kind: "character_identity",
      label: "角色定稿",
      priority: 100,
    }]))).rejects.toThrow("CANDIDATE_FINAL_REFERENCE_SINGLE_IDENTITY_ANCHOR_REQUIRED:character_final");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("DB-only Candidate Asset metadata v2 保存实际引用计划和生成模式", async () => {
    const imageProvider = new ImageProviderService({
      getRuntimeImageProviderSettings: () => ({
        type: "grok",
        apiKey: "test-key",
        baseUrl: "https://api.x.ai/v1",
        modelId: "grok-imagine-image-quality",
      }),
    } as never);
    const service = worker({ asset: { findMany: vi.fn() } }, imageProvider);
    const referencePlan = {
      schemaVersion: 1,
      compilerVersion: "candidate_reference_plan_v1",
      providerType: "grok",
      strategy: "direct",
      inputReferenceAssetIds: ["character_a"],
      usedReferenceAssetIds: ["character_a"],
      slots: [{
        order: 1,
        role: "direct_identity",
        providerReferenceId: "character_a",
        label: "角色 A",
        covers: ["character_a"],
      }],
      omittedRequired: [],
      compositionCoverage: "prompt_only",
      warnings: [],
    };
    const input = promptInput([]);
    const normalized = (service as unknown as {
      normalizeImageOutput(targetId: string, raw: unknown, input: Record<string, unknown>, projectId: string): unknown;
    }).normalizeImageOutput("shot_001", {
      candidates: [{
        index: 1,
        buffer: ONE_PIXEL_PNG,
        mimeType: "image/png",
        generationMode: "single_image_edit",
        referencePlan,
      }],
    }, input, "project_001");
    const assetCreate = vi.fn().mockResolvedValue(undefined);
    const tx = {
      asset: { create: assetCreate, update: vi.fn().mockResolvedValue(undefined) },
      candidate: { create: vi.fn().mockResolvedValue(undefined) },
    };

    await (service as unknown as {
      persistImageArtifacts(tx: unknown, claim: unknown, output: unknown, input: Record<string, unknown>, sourceDigest: string): Promise<void>;
    }).persistImageArtifacts(tx, {
      item: { id: "task_001", projectId: "project_001" },
    }, normalized, input, "sha256:source");

    const created = assetCreate.mock.calls[0]?.[0] as { data: Record<string, unknown> };
    expect(created.data).toMatchObject({
      metadataSchemaVersion: 2,
      metadataJson: {
        schemaVersion: 2,
        providerType: "grok",
        generationMode: "single_image_edit",
        requestedSize: { width: 1024, height: 1536 },
        actualSize: { width: 1, height: 1 },
        referenceAssetIds: ["character_a"],
        referencePlan: { strategy: "direct", omittedRequired: [] },
      },
    });
  });
});

function worker(database: Record<string, unknown>, imageProvider: ImageProviderService): PersistentTaskWorkerService {
  return new PersistentTaskWorkerService(
    { database: () => database } as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    imageProvider,
    new WorkspacePathService(),
    {} as never,
  );
}

async function runImageProvider(
  service: PersistentTaskWorkerService,
  input: Record<string, unknown>,
): Promise<{ candidates: Array<{ referencePlan?: Record<string, unknown> }> }> {
  return (service as unknown as {
    runImageProvider(context: unknown): Promise<{ candidates: Array<{ referencePlan?: Record<string, unknown> }> }>;
  }).runImageProvider({
    task: { item: { projectId: "project_001" } },
    input,
  });
}

function promptInput(referenceAssets: Array<Record<string, unknown>>): Record<string, unknown> {
  return {
    chapterId: "chapter_001",
    shotId: "shot_001",
    candidateCount: 1,
    generationSpecDigest: "sha256:generation",
    promptSpec: {
      schemaVersion: 2,
      sizePolicyVersion: "legacy_generation_default_v1",
      providerType: "grok",
      providerPrompt: "one clean illustration",
      positivePrompt: "one clean illustration",
      negativePrompt: "text",
      image: { width: 1024, height: 1536, sizePolicyVersion: "legacy_generation_default_v1" },
      referenceAssets,
    },
  };
}

function source(
  assetId: string,
  kind: "character_identity" | "scene_environment",
  sourceReferenceKind: "preview_front" | "scene_background",
): Record<string, unknown> {
  return { assetId, kind, label: assetId, priority: 100, sourceReferenceKind };
}

async function createAsset(root: string, assetId: string): Promise<Record<string, unknown>> {
  const storageKey = `projects/project_001/assets/${assetId}.png`;
  const absolutePath = path.join(root, storageKey);
  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, ONE_PIXEL_PNG);
  return { id: assetId, projectId: "project_001", status: "ready", storageKey, mimeType: "image/png" };
}
