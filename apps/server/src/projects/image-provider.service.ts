import { BadRequestException, Inject, Injectable } from "@nestjs/common";
import type { ImageProviderType } from "@airoaming/shared";
import { SettingsService } from "../settings/settings.service.js";
import { compileImageReferenceGuidanceForProvider } from "./image-prompt-profile.util.js";

export interface CandidateImageReferenceInput {
  assetId: string;
  kind: "character_identity" | "scene_environment";
  label: string;
  priority?: number;
  buffer: Buffer;
  mimeType: string;
  fileName: string;
}

export interface CandidateImageProviderResult {
  buffer: Buffer;
  generationMode: "image_generation" | "single_image_edit" | "multi_image_edit";
  usedReferenceAssetIds: string[];
  warnings: string[];
}

/**
 * 图片生成 Provider 网关。
 *
 * 从 ProjectsService 抽出(见任务 2026-06-24_角色参考图编排拆分 阶段1)。
 * 职责:封装出图 HTTP 调用(doubao/openai 分流)+ provider 配置读取,
 * 对外只暴露 generateImage / editImage,内部按 settings.type 自动分流。
 *
 * 抽出目的:打破"角色编排 → 出图方法(同 class 私有)"的循环依赖。
 * 本 service 不依赖 ProjectsService,角色编排单向依赖本 service。
 */
@Injectable()
export class ImageProviderService {
  constructor(@Inject(SettingsService) private readonly settingsService: SettingsService) {}

  /** 返回当前激活的 provider 类型,供调用方按 provider 决定 size 等差异参数。 */
  getActiveProviderType(): ImageProviderType {
    return this.settingsService.getRuntimeImageProviderSettings().type;
  }

  /** 候选图专用入口：在 provider 边界内处理多引用上限、比例和安全降级。 */
  async generateCandidateImage(input: {
    prompt: string;
    size: string;
    references: CandidateImageReferenceInput[];
    quality?: "auto" | "low" | "medium" | "high";
    outputFormat?: "webp" | "png" | "jpeg";
  }): Promise<CandidateImageProviderResult> {
    const config = this.resolveProviderConfig();
    if (config.type === "grok") {
      if (input.references.length >= 2) {
        const references = this.selectGrokReferences(input.references);
        const buffer = await this.requestGrokMultiImageEdit({
          apiKey: config.apiKey,
          baseUrl: config.baseUrl,
          model: config.modelId,
          prompt: compileImageReferenceGuidanceForProvider({
            providerType: "grok",
            prompt: input.prompt,
            references,
          }),
          size: input.size,
          references,
        });
        const omitted = input.references.filter((reference) =>
          !references.some((selected) => selected.assetId === reference.assetId),
        );
        return {
          buffer,
          generationMode: "multi_image_edit",
          usedReferenceAssetIds: references.map((reference) => reference.assetId),
          warnings: omitted.length > 0
            ? [
              "grok_reference_limit:3",
              `candidate_references_omitted:grok:${omitted.map((reference) => reference.assetId).join(",")}`,
            ]
            : [],
        };
      }

      const buffer = await this.requestGrokImage({
        apiKey: config.apiKey,
        baseUrl: config.baseUrl,
        model: config.modelId,
        prompt: input.prompt,
        size: input.size,
      });
      return {
        buffer,
        generationMode: "image_generation",
        usedReferenceAssetIds: [],
        warnings: input.references.length === 1
          ? [
            "grok_single_reference_omitted_for_aspect_ratio",
            `candidate_references_omitted:grok:${input.references[0]!.assetId}`,
          ]
          : [],
      };
    }

    if (config.type === "openai" && input.references.length > 0) {
      const references = this.selectReferencesByPriority(input.references, 16);
      const buffer = await this.requestOpenAiCandidateEdit({
        apiKey: config.apiKey,
        baseUrl: config.baseUrl,
        model: config.modelId,
        prompt: compileImageReferenceGuidanceForProvider({
          providerType: "openai",
          prompt: input.prompt,
          references,
        }),
        size: input.size,
        quality: input.quality ?? "high",
        outputFormat: input.outputFormat ?? "webp",
        references,
      });
      return {
        buffer,
        generationMode: references.length > 1 ? "multi_image_edit" : "single_image_edit",
        usedReferenceAssetIds: references.map((reference) => reference.assetId),
        warnings: this.buildReferenceLimitWarnings("openai", 16, input.references, references),
      };
    }

    if (config.type === "doubao" && input.references.length > 0) {
      const references = this.selectReferencesByPriority(input.references, 10);
      const buffer = await this.requestDoubaoCandidateEdit({
        apiKey: config.apiKey,
        baseUrl: config.baseUrl,
        model: config.modelId,
        prompt: compileImageReferenceGuidanceForProvider({
          providerType: "doubao",
          prompt: input.prompt,
          references,
        }),
        size: input.size,
        references,
      });
      return {
        buffer,
        generationMode: references.length > 1 ? "multi_image_edit" : "single_image_edit",
        usedReferenceAssetIds: references.map((reference) => reference.assetId),
        warnings: this.buildReferenceLimitWarnings("doubao", 10, input.references, references),
      };
    }

    return {
      buffer: await this.generateImage({
        prompt: input.prompt,
        size: input.size,
        quality: input.quality,
        outputFormat: input.outputFormat,
      }),
      generationMode: "image_generation",
      usedReferenceAssetIds: [],
      warnings: input.references.length > 0 ? [`${config.type}_candidate_references_not_enabled`] : [],
    };
  }

  /** 文生图:无参考图,纯 prompt 出图。 */
  async generateImage(input: {
    prompt: string;
    size: string;
    quality?: "auto" | "low" | "medium" | "high";
    outputFormat?: "webp" | "png" | "jpeg";
  }): Promise<Buffer> {
    const config = this.resolveProviderConfig();
    if (config.type === "doubao") {
      return this.requestDoubaoImage({
        apiKey: config.apiKey,
        baseUrl: config.baseUrl,
        model: config.modelId,
        prompt: input.prompt,
        size: input.size,
      });
    }
    if (config.type === "grok") {
      return this.requestGrokImage({
        apiKey: config.apiKey,
        baseUrl: config.baseUrl,
        model: config.modelId,
        prompt: input.prompt,
        size: input.size,
      });
    }
    return this.requestOpenAiImage({
      apiKey: config.apiKey,
      baseUrl: config.baseUrl,
      model: config.modelId,
      prompt: input.prompt,
      size: input.size,
      quality: input.quality ?? "high",
      outputFormat: input.outputFormat ?? "webp",
    });
  }

  /** 图生图:基于参考图(prompt + referenceImage)出图。 */
  async editImage(input: {
    prompt: string;
    size: string;
    referenceImage: { buffer: Buffer; mimeType: string; fileName: string };
    quality?: "auto" | "low" | "medium" | "high";
    outputFormat?: "webp" | "png" | "jpeg";
  }): Promise<Buffer> {
    const config = this.resolveProviderConfig();
    if (config.type === "doubao") {
      return this.requestDoubaoImageEdit({
        apiKey: config.apiKey,
        baseUrl: config.baseUrl,
        model: config.modelId,
        prompt: input.prompt,
        size: input.size,
        referenceImage: input.referenceImage,
      });
    }
    if (config.type === "grok") {
      return this.requestGrokImageEdit({
        apiKey: config.apiKey,
        baseUrl: config.baseUrl,
        model: config.modelId,
        prompt: input.prompt,
        referenceImage: input.referenceImage,
      });
    }
    return this.requestOpenAiImageEdit({
      apiKey: config.apiKey,
      baseUrl: config.baseUrl,
      model: config.modelId,
      prompt: input.prompt,
      size: input.size,
      quality: input.quality ?? "high",
      outputFormat: input.outputFormat ?? "webp",
      referenceImage: input.referenceImage,
    });
  }

  /** 读取并校验 provider 配置。apiKey/baseUrl 缺失时抛异常。 */
  private resolveProviderConfig(): {
    type: ImageProviderType;
    apiKey: string;
    baseUrl: string;
    modelId: string;
  } {
    const settings = this.settingsService.getRuntimeImageProviderSettings();
    const apiKey = settings.apiKey?.trim();
    const baseUrl = settings.baseUrl?.trim()
      || (settings.type === "openai" ? process.env.OPENAI_IMAGE_BASE_URL?.trim() : "")
      || "";
    if (!apiKey || !baseUrl) {
      throw new BadRequestException("IMAGE_PROVIDER_NOT_CONFIGURED");
    }
    return {
      type: settings.type,
      apiKey,
      baseUrl,
      modelId: settings.modelId,
    };
  }

  // ====== 以下为 provider 具体 HTTP 实现(从 ProjectsService 迁移,逻辑体逐字一致) ======

  /** Grok Imagine 文生图(JSON)。xAI 官方接口支持 OpenAI 兼容 /images/generations,但使用 aspect_ratio/resolution 而不是 OpenAI size。 */
  private async requestGrokImage(input: {
    apiKey: string;
    baseUrl: string;
    model: string;
    prompt: string;
    size: string;
  }): Promise<Buffer> {
    const url = `${input.baseUrl.replace(/\/+$/, "")}/images/generations`;
    const response = await this.fetchWithTimeout(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${input.apiKey}`,
      },
      body: JSON.stringify({
        model: input.model,
        prompt: input.prompt,
        n: 1,
        response_format: "b64_json",
        aspect_ratio: this.toGrokAspectRatio(input.size),
        resolution: "2k",
      }),
    });

    if (!response.ok) {
      throw new BadRequestException(`IMAGE_PROVIDER_FAILED:${response.status}`);
    }

    return this.downloadOpenAiCompatibleImageResponse(response);
  }

  /** Grok Imagine 图生图(JSON,data URI)。xAI 官方明确不支持 OpenAI SDK 的 multipart images.edit。 */
  private async requestGrokImageEdit(input: {
    apiKey: string;
    baseUrl: string;
    model: string;
    prompt: string;
    referenceImage: { buffer: Buffer; mimeType: string; fileName: string };
  }): Promise<Buffer> {
    const url = `${input.baseUrl.replace(/\/+$/, "")}/images/edits`;
    const base64Image = input.referenceImage.buffer.toString("base64");
    const response = await this.fetchWithTimeout(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${input.apiKey}`,
      },
      body: JSON.stringify({
        model: input.model,
        prompt: input.prompt,
        image: {
          url: `data:${input.referenceImage.mimeType};base64,${base64Image}`,
          type: "image_url",
        },
      }),
    });

    if (!response.ok) {
      throw new BadRequestException(`IMAGE_PROVIDER_EDIT_FAILED:${response.status}`);
    }

    return this.downloadOpenAiCompatibleImageResponse(response);
  }

  /** xAI 多图编辑：官方 JSON `images` 数组，2-3 张，可显式覆盖输出比例。 */
  private async requestGrokMultiImageEdit(input: {
    apiKey: string;
    baseUrl: string;
    model: string;
    prompt: string;
    size: string;
    references: CandidateImageReferenceInput[];
  }): Promise<Buffer> {
    const url = `${input.baseUrl.replace(/\/+$/, "")}/images/edits`;
    const response = await this.fetchWithTimeout(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${input.apiKey}`,
      },
      body: JSON.stringify({
        model: input.model,
        prompt: input.prompt,
        images: input.references.map((reference) => ({
          type: "image_url",
          url: `data:${reference.mimeType};base64,${reference.buffer.toString("base64")}`,
        })),
        aspect_ratio: this.toGrokAspectRatio(input.size),
      }),
    });
    if (!response.ok) {
      throw new BadRequestException(`IMAGE_PROVIDER_EDIT_FAILED:${response.status}`);
    }
    return this.downloadOpenAiCompatibleImageResponse(response, "IMAGE_PROVIDER_EDIT_URL_FAILED", "IMAGE_PROVIDER_EDIT_EMPTY_RESPONSE");
  }

  /** OpenAI 文生图。 */
  private async requestOpenAiImage(input: {
    apiKey: string;
    baseUrl: string;
    model: string;
    prompt: string;
    size: string;
    quality: "auto" | "low" | "medium" | "high";
    outputFormat: "webp" | "png" | "jpeg";
  }): Promise<Buffer> {
    const url = `${input.baseUrl.replace(/\/+$/, "")}/images/generations`;
    const response = await this.fetchWithTimeout(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${input.apiKey}`,
      },
      body: JSON.stringify({
        model: input.model,
        prompt: input.prompt,
        n: 1,
        size: input.size,
        quality: input.quality,
        output_format: input.outputFormat,
      }),
    });

    if (!response.ok) {
      throw new BadRequestException(`IMAGE_PROVIDER_FAILED:${response.status}`);
    }

    return this.downloadOpenAiCompatibleImageResponse(response);
  }

  /** OpenAI 图生图(multipart image 字段)。 */
  private async requestOpenAiImageEdit(input: {
    apiKey: string;
    baseUrl: string;
    model: string;
    prompt: string;
    size: string;
    quality: "auto" | "low" | "medium" | "high";
    outputFormat: "webp" | "png" | "jpeg";
    referenceImage: { buffer: Buffer; mimeType: string; fileName: string };
  }): Promise<Buffer> {
    const url = `${input.baseUrl.replace(/\/+$/, "")}/images/edits`;
    const form = new FormData();
    const referenceBytes = new Uint8Array(input.referenceImage.buffer.length);
    referenceBytes.set(input.referenceImage.buffer);
    form.set("model", input.model);
    form.set("prompt", input.prompt);
    form.set("n", "1");
    form.set("size", input.size);
    form.set("quality", input.quality);
    form.set("output_format", input.outputFormat);
    form.set(
      "image",
      new Blob([referenceBytes], { type: input.referenceImage.mimeType }),
      input.referenceImage.fileName,
    );

    const response = await this.fetchWithTimeout(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${input.apiKey}`,
      },
      body: form,
    });

    if (!response.ok) {
      throw new BadRequestException(`IMAGE_PROVIDER_EDIT_FAILED:${response.status}`);
    }

    return this.downloadOpenAiCompatibleImageResponse(response, "IMAGE_PROVIDER_EDIT_URL_FAILED", "IMAGE_PROVIDER_EDIT_EMPTY_RESPONSE");
  }

  /** OpenAI GPT Image 多图编辑：multipart 中重复提交 `image[]`。 */
  private async requestOpenAiCandidateEdit(input: {
    apiKey: string;
    baseUrl: string;
    model: string;
    prompt: string;
    size: string;
    quality: "auto" | "low" | "medium" | "high";
    outputFormat: "webp" | "png" | "jpeg";
    references: CandidateImageReferenceInput[];
  }): Promise<Buffer> {
    const url = `${input.baseUrl.replace(/\/+$/, "")}/images/edits`;
    const form = new FormData();
    form.set("model", input.model);
    form.set("prompt", input.prompt);
    form.set("n", "1");
    form.set("size", input.size);
    form.set("quality", input.quality);
    form.set("output_format", input.outputFormat);
    for (const reference of input.references) {
      const bytes = new Uint8Array(reference.buffer.length);
      bytes.set(reference.buffer);
      form.append("image[]", new Blob([bytes], { type: reference.mimeType }), reference.fileName);
    }
    const response = await this.fetchWithTimeout(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${input.apiKey}` },
      body: form,
    });
    if (!response.ok) {
      throw new BadRequestException(`IMAGE_PROVIDER_EDIT_FAILED:${response.status}`);
    }
    return this.downloadOpenAiCompatibleImageResponse(response, "IMAGE_PROVIDER_EDIT_URL_FAILED", "IMAGE_PROVIDER_EDIT_EMPTY_RESPONSE");
  }

  /** 豆包 doubao-seedream 文生图(JSON)。 */
  private async requestDoubaoImage(input: {
    apiKey: string;
    baseUrl: string;
    model: string;
    prompt: string;
    size: string;
  }): Promise<Buffer> {
    const url = `${input.baseUrl.replace(/\/+$/, "")}/images/generations`;
    const response = await this.fetchWithTimeout(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${input.apiKey}`,
      },
      body: JSON.stringify({
        model: input.model,
        prompt: input.prompt,
        size: input.size,
        response_format: "url",
        watermark: false,
        stream: false,
        sequential_image_generation: "disabled",
      }),
    });

    if (!response.ok) {
      throw new BadRequestException(`IMAGE_PROVIDER_FAILED:${response.status}`);
    }

    return this.downloadDoubaoImageResponse(response);
  }

  /** 豆包 doubao-seedream 图生图(JSON,image 字段传 data:image/<fmt>;base64)。 */
  private async requestDoubaoImageEdit(input: {
    apiKey: string;
    baseUrl: string;
    model: string;
    prompt: string;
    size: string;
    referenceImage: { buffer: Buffer; mimeType: string; fileName: string };
  }): Promise<Buffer> {
    const url = `${input.baseUrl.replace(/\/+$/, "")}/images/generations`;
    const base64Image = input.referenceImage.buffer.toString("base64");
    const response = await this.fetchWithTimeout(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${input.apiKey}`,
      },
      body: JSON.stringify({
        model: input.model,
        prompt: input.prompt,
        image: `data:${input.referenceImage.mimeType};base64,${base64Image}`,
        size: input.size,
        response_format: "url",
        watermark: false,
        stream: false,
      }),
    });

    if (!response.ok) {
      throw new BadRequestException(`IMAGE_PROVIDER_EDIT_FAILED:${response.status}`);
    }

    return this.downloadDoubaoImageResponse(response);
  }

  /** Seedream 候选图编辑：单引用传字符串，多引用传 `image` 数组，固定只输出一张。 */
  private async requestDoubaoCandidateEdit(input: {
    apiKey: string;
    baseUrl: string;
    model: string;
    prompt: string;
    size: string;
    references: CandidateImageReferenceInput[];
  }): Promise<Buffer> {
    const url = `${input.baseUrl.replace(/\/+$/, "")}/images/generations`;
    const images = input.references.map((reference) =>
      `data:${reference.mimeType};base64,${reference.buffer.toString("base64")}`,
    );
    const response = await this.fetchWithTimeout(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${input.apiKey}`,
      },
      body: JSON.stringify({
        model: input.model,
        prompt: input.prompt,
        image: images.length === 1 ? images[0] : images,
        size: input.size,
        response_format: "url",
        watermark: false,
        stream: false,
        sequential_image_generation: "disabled",
      }),
    });
    if (!response.ok) {
      throw new BadRequestException(`IMAGE_PROVIDER_EDIT_FAILED:${response.status}`);
    }
    return this.downloadDoubaoImageResponse(response);
  }

  /** 豆包响应统一处理:取 data[0].url 或 b64_json 下载成 Buffer。 */
  private async downloadDoubaoImageResponse(response: Response): Promise<Buffer> {
    return this.downloadOpenAiCompatibleImageResponse(response);
  }

  /** OpenAI/Grok/豆包响应统一处理:取 data[0].b64_json 或 url 下载成 Buffer。 */
  private async downloadOpenAiCompatibleImageResponse(
    response: Response,
    urlErrorCode = "IMAGE_PROVIDER_URL_FAILED",
    emptyErrorCode = "IMAGE_PROVIDER_EMPTY_RESPONSE",
  ): Promise<Buffer> {
    const data = await response.json() as { data?: Array<{ b64_json?: string; url?: string }> };
    const first = data.data?.[0];
    if (first?.b64_json) {
      return Buffer.from(first.b64_json, "base64");
    }
    if (first?.url) {
      const imageResponse = await this.fetchWithTimeout(first.url);
      if (!imageResponse.ok) {
        throw new BadRequestException(`${urlErrorCode}:${imageResponse.status}`);
      }
      return Buffer.from(await imageResponse.arrayBuffer());
    }

    throw new BadRequestException(emptyErrorCode);
  }

  private toGrokAspectRatio(size: string): string {
    const match = /^(\d+)x(\d+)$/i.exec(size.trim());
    if (!match) {
      return "auto";
    }
    const width = Number(match[1]);
    const height = Number(match[2]);
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
      return "auto";
    }
    if (width === height) return "1:1";
    const targetRatio = width / height;
    const supported = [
      ["1:1", 1],
      ["16:9", 16 / 9],
      ["9:16", 9 / 16],
      ["4:3", 4 / 3],
      ["3:4", 3 / 4],
      ["3:2", 3 / 2],
      ["2:3", 2 / 3],
      ["2:1", 2],
      ["1:2", 1 / 2],
      ["19.5:9", 19.5 / 9],
      ["9:19.5", 9 / 19.5],
      ["20:9", 20 / 9],
      ["9:20", 9 / 20],
    ] as const;
    return supported.reduce((best, current) => {
      const bestDistance = Math.abs(Math.log(targetRatio / best[1]));
      const currentDistance = Math.abs(Math.log(targetRatio / current[1]));
      return currentDistance < bestDistance ? current : best;
    })[0];
  }

  private selectGrokReferences(references: CandidateImageReferenceInput[]): CandidateImageReferenceInput[] {
    if (references.length <= 3) {
      return references;
    }
    const byPriority = (left: CandidateImageReferenceInput, right: CandidateImageReferenceInput) =>
      (right.priority ?? 0) - (left.priority ?? 0);
    const scene = references
      .filter((reference) => reference.kind === "scene_environment")
      .sort(byPriority)[0];
    if (!scene) {
      return [...references].sort(byPriority).slice(0, 3);
    }
    const characters = references
      .filter((reference) => reference.kind === "character_identity")
      .sort(byPriority)
      .slice(0, 2);
    return [...characters, scene].slice(0, 3);
  }

  private selectReferencesByPriority(
    references: CandidateImageReferenceInput[],
    limit: number,
  ): CandidateImageReferenceInput[] {
    if (references.length <= limit) {
      return references;
    }
    return [...references]
      .sort((left, right) => (right.priority ?? 0) - (left.priority ?? 0))
      .slice(0, limit);
  }

  private buildReferenceLimitWarnings(
    provider: "openai" | "doubao",
    limit: number,
    requested: CandidateImageReferenceInput[],
    selected: CandidateImageReferenceInput[],
  ): string[] {
    const omitted = requested.filter((reference) =>
      !selected.some((item) => item.assetId === reference.assetId),
    );
    if (omitted.length === 0) {
      return [];
    }
    return [
      `${provider}_reference_limit:${limit}`,
      `candidate_references_omitted:${provider}:${omitted.map((reference) => reference.assetId).join(",")}`,
    ];
  }

  /** fetch 带超时(默认 300 秒,适配出图长耗时)。 */
  private async fetchWithTimeout(url: string, init: RequestInit = {}, timeoutMs = 300_000): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(url, {
        ...init,
        signal: init.signal ?? controller.signal,
      });
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new BadRequestException("IMAGE_PROVIDER_TIMEOUT");
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }
}
