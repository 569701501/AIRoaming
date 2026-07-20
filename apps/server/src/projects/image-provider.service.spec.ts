import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ImageProviderService } from "./image-provider.service.js";

const ONE_PIXEL_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);
const ONE_PIXEL_PNG_DATA_URI = `data:image/png;base64,${ONE_PIXEL_PNG.toString("base64")}`;

describe("ImageProviderService.generateCandidateImage", () => {
  beforeEach(() => {
    vi.stubEnv("GROK_IMAGE_RESOLUTION", "");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("Grok 有两张镜头级引用时使用多图编辑并显式覆盖目标比例", async () => {
    const fetchMock = vi.fn().mockImplementation(async () => new Response(JSON.stringify({
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
          buffer: ONE_PIXEL_PNG,
          mimeType: "image/png",
          fileName: "kurapika.png",
          sourceReferenceKind: "preview_front",
        },
        {
          assetId: "asset_scene",
          kind: "scene_environment",
          label: "海边病房",
          buffer: ONE_PIXEL_PNG,
          mimeType: "image/png",
          fileName: "ward.png",
          sourceReferenceKind: "scene_background",
        },
      ],
    });

    expect(result.generationMode).toBe("multi_image_edit");
    expect(result.usedReferenceAssetIds).toEqual(["asset_character", "asset_scene"]);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.x.ai/v1/images/edits");
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    expect(body.aspect_ratio).toBe("2:3");
    expect(body.resolution).toBe("1k");
    expect(body.images).toEqual([
      { type: "image_url", url: ONE_PIXEL_PNG_DATA_URI },
      { type: "image_url", url: ONE_PIXEL_PNG_DATA_URI },
    ]);
    expect(body.prompt).toContain("Image 1 (酷拉皮卡) supplies character identity only");
    expect(body.prompt).toContain("Image 2 (海边病房) supplies scene identity only");
    expect(body.prompt).toContain("References do not override the requested subject count");
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
          buffer: ONE_PIXEL_PNG,
          mimeType: "image/png",
          fileName: "kurapika.png",
          sourceReferenceKind: "preview_front",
        },
        {
          assetId: "asset_scene",
          kind: "scene_environment",
          label: "海边病房",
          buffer: ONE_PIXEL_PNG,
          mimeType: "image/png",
          fileName: "ward.png",
          sourceReferenceKind: "scene_background",
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
    expect(body.get("prompt")).toContain("Image 1 (酷拉皮卡) supplies character identity only");
    expect(body.get("prompt")).toContain("Ignore the reference background, labels, border, and contact-sheet layout");
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
          buffer: ONE_PIXEL_PNG,
          mimeType: "image/png",
          fileName: "kurapika.png",
          sourceReferenceKind: "preview_front",
        },
        {
          assetId: "asset_scene",
          kind: "scene_environment",
          label: "海边病房",
          buffer: ONE_PIXEL_PNG,
          mimeType: "image/png",
          fileName: "ward.png",
          sourceReferenceKind: "scene_background",
        },
      ],
    });

    expect(result.generationMode).toBe("multi_image_edit");
    expect(result.usedReferenceAssetIds).toEqual(["asset_character", "asset_scene"]);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://ark.cn-beijing.volces.com/api/v3/images/generations");
    const body = JSON.parse(String(init.body)) as { image: string[]; size: string; prompt: string; watermark: boolean; sequential_image_generation: string };
    expect(body.image).toEqual([
      ONE_PIXEL_PNG_DATA_URI,
      ONE_PIXEL_PNG_DATA_URI,
    ]);
    expect(body.size).toBe("1440x2560");
    expect(body.watermark).toBe(false);
    expect(body.sequential_image_generation).toBe("disabled");
    expect(body.prompt).toContain("图 1（酷拉皮卡）：只提供这个角色的身份");
    expect(body.prompt).toContain("图 2（海边病房）：只提供场景空间身份");
  });

  it("Runware 无参考草稿使用 Schnell、任务数组与规范化尺寸", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      data: [{ imageBase64Data: Buffer.from("runware-draft").toString("base64") }],
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    const service = new ImageProviderService({
      getRuntimeImageProviderSettings: () => ({
        type: "runware",
        apiKey: "runware-test-key",
        baseUrl: "https://api.runware.ai/v1/",
        modelId: "runware:100@1",
      }),
    } as never);

    const result = await service.generateImage({
      prompt: "one cheap storyboard draft",
      size: "1537x1025",
    });

    expect(result.toString()).toBe("runware-draft");
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.runware.ai/v1");
    expect(init.headers).toMatchObject({ Authorization: "Bearer runware-test-key" });
    const body = JSON.parse(String(init.body)) as Array<Record<string, unknown>>;
    expect(body).toHaveLength(1);
    expect(body[0]).toMatchObject({
      taskType: "imageInference",
      model: "runware:100@1",
      positivePrompt: "one cheap storyboard draft",
      width: 1536,
      height: 1024,
      steps: 4,
      numberResults: 1,
      outputType: "base64Data",
      outputFormat: "WEBP",
    });
    expect(body[0]?.taskUUID).toMatch(/^[0-9a-f-]{36}$/);
    expect(body[0]).not.toHaveProperty("ipAdapters");
    expect(body[0]).not.toHaveProperty("inputs");
  });

  it("Runware 单图精修使用 FLUX.2 Dev referenceImages 官方路径", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      data: [{ imageDataURI: `data:image/webp;base64,${Buffer.from("runware-edit").toString("base64")}` }],
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    const service = new ImageProviderService({
      getRuntimeImageProviderSettings: () => ({
        type: "runware",
        apiKey: "runware-test-key",
        baseUrl: "https://api.runware.ai/v1",
        modelId: "runware:100@1",
      }),
    } as never);

    const result = await service.editImage({
      prompt: "change the expression and lighting",
      size: "513x767",
      referenceImage: { buffer: ONE_PIXEL_PNG, mimeType: "image/png", fileName: "selected.png" },
    });

    expect(result.toString()).toBe("runware-edit");
    const body = JSON.parse(String((fetchMock.mock.calls[0]?.[1] as RequestInit).body)) as Array<{
      model: string;
      width: number;
      height: number;
      referenceImages: string[];
      steps: number;
      CFGScale: number;
    }>;
    expect(body[0]).toMatchObject({
      model: "runware:400@1",
      width: 512,
      height: 768,
      referenceImages: [ONE_PIXEL_PNG_DATA_URI],
      steps: 28,
      CFGScale: 4,
    });
  });

  it("Runware 候选图把全部必需参考交给 Dev + FLUX IP-Adapter", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      data: [{ imageBase64Data: Buffer.from("runware-candidate").toString("base64") }],
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    const service = new ImageProviderService({
      getRuntimeImageProviderSettings: () => ({
        type: "runware",
        apiKey: "runware-test-key",
        baseUrl: "https://api.runware.ai/v1",
        modelId: "runware:100@1",
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
          buffer: ONE_PIXEL_PNG,
          mimeType: "image/png",
          fileName: "kurapika.png",
          sourceReferenceKind: "preview_front",
        },
        {
          assetId: "asset_scene",
          kind: "scene_environment",
          label: "海边病房",
          buffer: ONE_PIXEL_PNG,
          mimeType: "image/png",
          fileName: "ward.png",
          sourceReferenceKind: "scene_background",
        },
      ],
    });

    expect(result.generationMode).toBe("multi_image_edit");
    expect(result.usedReferenceAssetIds).toEqual(["asset_character", "asset_scene"]);
    expect(result.referencePlan.omittedRequired).toEqual([]);
    const body = JSON.parse(String((fetchMock.mock.calls[0]?.[1] as RequestInit).body)) as Array<{
      model: string;
      steps: number;
      positivePrompt: string;
      ipAdapters: Array<{ model: string; guideImages: string[]; weight: number }>;
    }>;
    expect(body[0]).toMatchObject({ model: "runware:101@1", steps: 24 });
    expect(body[0]?.ipAdapters).toEqual([{
      model: "runware:56@1",
      guideImages: [ONE_PIXEL_PNG_DATA_URI, ONE_PIXEL_PNG_DATA_URI],
      weight: 0.65,
    }]);
    expect(body[0]?.positivePrompt).toContain("Image 1 (酷拉皮卡) supplies character identity only");
    expect(body[0]?.positivePrompt).toContain("Image 2 (海边病房) supplies scene identity only");
  });

  it("Seedream 超过十张引用时把全部角色编成身份板而不省略资产", async () => {
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
        buffer: ONE_PIXEL_PNG,
        mimeType: "image/png",
        fileName: "low.png",
        sourceReferenceKind: "preview_front" as const,
      },
      ...Array.from({ length: 10 }, (_, index) => ({
        assetId: `character_${index + 1}`,
        kind: "character_identity" as const,
        label: `角色 ${index + 1}`,
        priority: 100 - index,
        buffer: ONE_PIXEL_PNG,
        mimeType: "image/png",
        fileName: `character_${index + 1}.png`,
        sourceReferenceKind: "preview_front" as const,
      })),
    ];

    const result = await service.generateCandidateImage({
      prompt: "one clean illustration",
      size: "1440x2560",
      references,
    });

    expect(result.usedReferenceAssetIds).toHaveLength(11);
    expect(result.usedReferenceAssetIds).toContain("character_low_priority");
    expect(result.referencePlan.strategy).toBe("cast_identity_board");
    expect(result.referencePlan.omittedRequired).toEqual([]);
    expect(result.warnings).toEqual([
      "candidate_references_packed:doubao:cast_identity_board:11",
      "candidate_cast_identity_board_visual_quality_unverified:11",
    ]);
    const body = JSON.parse(String((fetchMock.mock.calls[0]?.[1] as RequestInit).body)) as { image: string; prompt: string };
    expect(typeof body.image).toBe("string");
    expect(body.image).toMatch(/^data:image\/webp;base64,/);
    expect(body.prompt).toContain("这是多人角色身份板");
  });

  it("Grok 三个角色加场景时发送身份板加场景并保留全部来源覆盖", async () => {
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
      buffer: ONE_PIXEL_PNG,
      mimeType: "image/png",
      fileName: `${assetId}.png`,
      sourceReferenceKind: kind === "character_identity" ? "preview_front" as const : "scene_background" as const,
    });

    const result = await service.generateCandidateImage({
      prompt: "one clean illustration",
      size: "1024x1536",
      references: [
        reference("character_primary", "character_identity", 100),
        reference("character_supporting", "character_identity", 80),
        reference("character_background", "character_identity", 10),
        reference("scene_1", "scene_environment", 90),
      ],
    });

    expect(result.usedReferenceAssetIds).toEqual([
      "character_primary",
      "character_supporting",
      "character_background",
      "scene_1",
    ]);
    expect(result.referencePlan).toMatchObject({
      strategy: "cast_identity_board",
      omittedRequired: [],
      slots: [
        { order: 1, role: "cast_identity_board", covers: ["character_primary", "character_supporting", "character_background"] },
        { order: 2, role: "scene_environment", covers: ["scene_1"] },
      ],
    });
    expect(result.warnings).toEqual([
      "candidate_references_packed:grok:cast_identity_board:3",
      "candidate_cast_identity_board_visual_quality_unverified:3",
    ]);
    const body = JSON.parse(String((fetchMock.mock.calls[0]?.[1] as RequestInit).body)) as {
      images: Array<{ url: string }>;
      prompt: string;
    };
    expect(body.images).toHaveLength(2);
    expect(body.images[0]?.url).toMatch(/^data:image\/webp;base64,/);
    expect(body.images[1]?.url).toBe(ONE_PIXEL_PNG_DATA_URI);
    expect(body.prompt).toContain("is a cast identity board");
    expect(body.prompt).toContain("Image 2 (scene_1) supplies scene identity only");
  });

  it("Grok 只有一张引用时使用单图编辑且不再省略必需参考", async () => {
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
        buffer: ONE_PIXEL_PNG,
        mimeType: "image/png",
        fileName: "kurapika.png",
        sourceReferenceKind: "preview_front",
      }],
    });

    expect(result.generationMode).toBe("single_image_edit");
    expect(result.usedReferenceAssetIds).toEqual(["asset_character"]);
    expect(result.referencePlan.omittedRequired).toEqual([]);
    expect(result.warnings).toEqual(["grok_single_reference_output_aspect_ratio_follows_input"]);
    expect(fetchMock.mock.calls[0]?.[0]).toBe("https://api.x.ai/v1/images/edits");
    const body = JSON.parse(String((fetchMock.mock.calls[0]?.[1] as RequestInit).body)) as {
      image: { type: string; url: string };
      prompt: string;
      resolution: string;
    };
    expect(body.image).toEqual({ type: "image_url", url: ONE_PIXEL_PNG_DATA_URI });
    expect(body.resolution).toBe("1k");
    expect(body.prompt).toContain("Image 1 (酷拉皮卡) supplies character identity only");
  });

  it("Grok 文生图默认使用 1K，并允许显式切回 2K", async () => {
    const fetchMock = vi.fn().mockImplementation(async () => new Response(JSON.stringify({
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

    await service.generateImage({ prompt: "场景", size: "1536x1024" });
    vi.stubEnv("GROK_IMAGE_RESOLUTION", "2k");
    await service.generateImage({ prompt: "场景", size: "1536x1024" });

    const firstBody = JSON.parse(String((fetchMock.mock.calls[0]?.[1] as RequestInit).body)) as Record<string, unknown>;
    const secondBody = JSON.parse(String((fetchMock.mock.calls[1]?.[1] as RequestInit).body)) as Record<string, unknown>;
    expect(firstBody).toMatchObject({ aspect_ratio: "3:2", resolution: "1k" });
    expect(secondBody).toMatchObject({ aspect_ratio: "3:2", resolution: "2k" });
  });

  it("Grok 非法分辨率配置在联网前失败", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    vi.stubEnv("GROK_IMAGE_RESOLUTION", "4k");
    const service = new ImageProviderService({
      getRuntimeImageProviderSettings: () => ({
        type: "grok",
        apiKey: "test-key",
        baseUrl: "https://api.x.ai/v1",
        modelId: "grok-imagine-image-quality",
      }),
    } as never);

    await expect(service.generateImage({ prompt: "场景", size: "1536x1024" }))
      .rejects.toThrow("IMAGE_PROVIDER_GROK_RESOLUTION_INVALID");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("Seedream 文生图与单图编辑都在请求层关闭水印", async () => {
    const fetchMock = vi.fn().mockImplementation(async () => new Response(JSON.stringify({
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

    await service.generateImage({ prompt: "场景", size: "1536x1024" });
    await service.editImage({
      prompt: "角色定稿",
      size: "1536x1024",
      referenceImage: { buffer: Buffer.from("reference"), mimeType: "image/webp", fileName: "reference.webp" },
    });

    const firstBody = JSON.parse(String((fetchMock.mock.calls[0]?.[1] as RequestInit).body)) as Record<string, unknown>;
    const secondBody = JSON.parse(String((fetchMock.mock.calls[1]?.[1] as RequestInit).body)) as Record<string, unknown>;
    expect(firstBody).toMatchObject({ watermark: false, size: "1536x1024" });
    expect(secondBody).toMatchObject({ watermark: false, size: "1536x1024" });
  });
});
