import { afterEach, describe, expect, it, vi } from "vitest";
import { ImageProviderService } from "./image-provider.service.js";

describe("ImageProviderService.generateCandidateImage", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("Grok 有两张镜头级引用时使用多图编辑并显式覆盖目标比例", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      data: [{ b64_json: Buffer.from("generated-image").toString("base64") }],
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    const service = new ImageProviderService({
      getRuntimeImageProviderSettings: () => ({
        type: "grok",
        apiKey: "test-key",
        baseUrl: "https://api.x.ai/v1",
        modelId: "grok-imagine-image-quality",
      }),
    } as never);

    const result = await service.generateCandidateImage({
      prompt: "one clean illustration",
      size: "1024x1536",
      references: [
        {
          assetId: "asset_character",
          kind: "character_identity",
          label: "酷拉皮卡",
          buffer: Buffer.from("character"),
          mimeType: "image/webp",
          fileName: "kurapika.webp",
        },
        {
          assetId: "asset_scene",
          kind: "scene_environment",
          label: "海边病房",
          buffer: Buffer.from("scene"),
          mimeType: "image/webp",
          fileName: "ward.webp",
        },
      ],
    });

    expect(result.generationMode).toBe("multi_image_edit");
    expect(result.usedReferenceAssetIds).toEqual(["asset_character", "asset_scene"]);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.x.ai/v1/images/edits");
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    expect(body.aspect_ratio).toBe("2:3");
    expect(body.images).toEqual([
      { type: "image_url", url: `data:image/webp;base64,${Buffer.from("character").toString("base64")}` },
      { type: "image_url", url: `data:image/webp;base64,${Buffer.from("scene").toString("base64")}` },
    ]);
  });

  it("OpenAI 用重复 image[] 提交全部镜头级引用并保留固定尺寸", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      data: [{ b64_json: Buffer.from("generated-image").toString("base64") }],
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    const service = new ImageProviderService({
      getRuntimeImageProviderSettings: () => ({
        type: "openai",
        apiKey: "test-key",
        baseUrl: "https://api.openai.com/v1",
        modelId: "gpt-image-1.5",
      }),
    } as never);

    const result = await service.generateCandidateImage({
      prompt: "one clean illustration",
      size: "1024x1536",
      references: [
        {
          assetId: "asset_character",
          kind: "character_identity",
          label: "酷拉皮卡",
          buffer: Buffer.from("character"),
          mimeType: "image/webp",
          fileName: "kurapika.webp",
        },
        {
          assetId: "asset_scene",
          kind: "scene_environment",
          label: "海边病房",
          buffer: Buffer.from("scene"),
          mimeType: "image/webp",
          fileName: "ward.webp",
        },
      ],
    });

    expect(result.generationMode).toBe("multi_image_edit");
    expect(result.usedReferenceAssetIds).toEqual(["asset_character", "asset_scene"]);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.openai.com/v1/images/edits");
    const body = init.body as FormData;
    expect(body.get("size")).toBe("1024x1536");
    expect(body.getAll("image[]")).toHaveLength(2);
  });

  it("Seedream 用 image 数组提交多引用并显式保留输出尺寸", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      data: [{ b64_json: Buffer.from("generated-image").toString("base64") }],
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    const service = new ImageProviderService({
      getRuntimeImageProviderSettings: () => ({
        type: "doubao",
        apiKey: "test-key",
        baseUrl: "https://ark.cn-beijing.volces.com/api/v3",
        modelId: "doubao-seedream-4-5",
      }),
    } as never);

    const result = await service.generateCandidateImage({
      prompt: "one clean illustration",
      size: "1440x2560",
      references: [
        {
          assetId: "asset_character",
          kind: "character_identity",
          label: "酷拉皮卡",
          buffer: Buffer.from("character"),
          mimeType: "image/webp",
          fileName: "kurapika.webp",
        },
        {
          assetId: "asset_scene",
          kind: "scene_environment",
          label: "海边病房",
          buffer: Buffer.from("scene"),
          mimeType: "image/webp",
          fileName: "ward.webp",
        },
      ],
    });

    expect(result.generationMode).toBe("multi_image_edit");
    expect(result.usedReferenceAssetIds).toEqual(["asset_character", "asset_scene"]);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://ark.cn-beijing.volces.com/api/v3/images/generations");
    const body = JSON.parse(String(init.body)) as { image: string[]; size: string; sequential_image_generation: string };
    expect(body.image).toEqual([
      `data:image/webp;base64,${Buffer.from("character").toString("base64")}`,
      `data:image/webp;base64,${Buffer.from("scene").toString("base64")}`,
    ]);
    expect(body.size).toBe("1440x2560");
    expect(body.sequential_image_generation).toBe("disabled");
  });

  it("Seedream 超过十张引用时按优先级裁剪并记录省略资产", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      data: [{ b64_json: Buffer.from("generated-image").toString("base64") }],
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    const service = new ImageProviderService({
      getRuntimeImageProviderSettings: () => ({
        type: "doubao",
        apiKey: "test-key",
        baseUrl: "https://ark.cn-beijing.volces.com/api/v3",
        modelId: "doubao-seedream-4-5",
      }),
    } as never);
    const references = [
      {
        assetId: "character_low_priority",
        kind: "character_identity" as const,
        label: "低优先级背景角色",
        priority: 0,
        buffer: Buffer.from("low"),
        mimeType: "image/webp",
        fileName: "low.webp",
      },
      ...Array.from({ length: 10 }, (_, index) => ({
        assetId: `character_${index + 1}`,
        kind: "character_identity" as const,
        label: `角色 ${index + 1}`,
        priority: 100 - index,
        buffer: Buffer.from(`character_${index + 1}`),
        mimeType: "image/webp",
        fileName: `character_${index + 1}.webp`,
      })),
    ];

    const result = await service.generateCandidateImage({
      prompt: "one clean illustration",
      size: "1440x2560",
      references,
    });

    expect(result.usedReferenceAssetIds).toHaveLength(10);
    expect(result.usedReferenceAssetIds).not.toContain("character_low_priority");
    expect(result.warnings).toEqual([
      "doubao_reference_limit:10",
      "candidate_references_omitted:doubao:character_low_priority",
    ]);
  });

  it("Grok 超过三张引用时按显式优先级保留两个主体和当前场景，并记录省略资产", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      data: [{ b64_json: Buffer.from("generated-image").toString("base64") }],
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    const service = new ImageProviderService({
      getRuntimeImageProviderSettings: () => ({
        type: "grok",
        apiKey: "test-key",
        baseUrl: "https://api.x.ai/v1",
        modelId: "grok-imagine-image-quality",
      }),
    } as never);
    const reference = (assetId: string, kind: "character_identity" | "scene_environment", priority: number) => ({
      assetId,
      kind,
      label: assetId,
      priority,
      buffer: Buffer.from(assetId),
      mimeType: "image/webp",
      fileName: `${assetId}.webp`,
    });

    const result = await service.generateCandidateImage({
      prompt: "one clean illustration",
      size: "1024x1536",
      references: [
        reference("character_background", "character_identity", 10),
        reference("scene_1", "scene_environment", 90),
        reference("character_supporting", "character_identity", 80),
        reference("character_primary", "character_identity", 100),
      ],
    });

    expect(result.usedReferenceAssetIds).toEqual(["character_primary", "character_supporting", "scene_1"]);
    expect(result.warnings).toEqual([
      "grok_reference_limit:3",
      "candidate_references_omitted:grok:character_background",
    ]);
  });

  it("Grok 只有一张引用时降级纯文生图以避免继承参考图比例", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      data: [{ b64_json: Buffer.from("generated-image").toString("base64") }],
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    const service = new ImageProviderService({
      getRuntimeImageProviderSettings: () => ({
        type: "grok",
        apiKey: "test-key",
        baseUrl: "https://api.x.ai/v1",
        modelId: "grok-imagine-image-quality",
      }),
    } as never);

    const result = await service.generateCandidateImage({
      prompt: "one clean illustration",
      size: "1024x1536",
      references: [{
        assetId: "asset_character",
        kind: "character_identity",
        label: "酷拉皮卡",
        buffer: Buffer.from("character"),
        mimeType: "image/webp",
        fileName: "kurapika.webp",
      }],
    });

    expect(result.generationMode).toBe("image_generation");
    expect(result.usedReferenceAssetIds).toEqual([]);
    expect(result.warnings).toEqual([
      "grok_single_reference_omitted_for_aspect_ratio",
      "candidate_references_omitted:grok:asset_character",
    ]);
    expect(fetchMock.mock.calls[0]?.[0]).toBe("https://api.x.ai/v1/images/generations");
  });
});
