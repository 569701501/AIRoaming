import { BadRequestException, Inject, Injectable } from "@nestjs/common";
import { SettingsService } from "../settings/settings.service.js";

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
  getActiveProviderType(): "doubao" | "openai" {
    return this.settingsService.getRuntimeImageProviderSettings().type;
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
    type: "doubao" | "openai";
    apiKey: string;
    baseUrl: string;
    modelId: string;
  } {
    const settings = this.settingsService.getRuntimeImageProviderSettings();
    const apiKey = settings.apiKey?.trim();
    const baseUrl = settings.baseUrl?.trim() || process.env.OPENAI_IMAGE_BASE_URL?.trim() || "";
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

    const data = await response.json() as { data?: Array<{ b64_json?: string; url?: string }> };
    const first = data.data?.[0];
    if (first?.b64_json) {
      return Buffer.from(first.b64_json, "base64");
    }
    if (first?.url) {
      const imageResponse = await this.fetchWithTimeout(first.url);
      if (!imageResponse.ok) {
        throw new BadRequestException(`IMAGE_PROVIDER_URL_FAILED:${imageResponse.status}`);
      }
      return Buffer.from(await imageResponse.arrayBuffer());
    }

    throw new BadRequestException("IMAGE_PROVIDER_EMPTY_RESPONSE");
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

    const data = await response.json() as { data?: Array<{ b64_json?: string; url?: string }> };
    const first = data.data?.[0];
    if (first?.b64_json) {
      return Buffer.from(first.b64_json, "base64");
    }
    if (first?.url) {
      const imageResponse = await this.fetchWithTimeout(first.url);
      if (!imageResponse.ok) {
        throw new BadRequestException(`IMAGE_PROVIDER_EDIT_URL_FAILED:${imageResponse.status}`);
      }
      return Buffer.from(await imageResponse.arrayBuffer());
    }

    throw new BadRequestException("IMAGE_PROVIDER_EDIT_EMPTY_RESPONSE");
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
        watermark: true,
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
        watermark: true,
        stream: false,
      }),
    });

    if (!response.ok) {
      throw new BadRequestException(`IMAGE_PROVIDER_EDIT_FAILED:${response.status}`);
    }

    return this.downloadDoubaoImageResponse(response);
  }

  /** 豆包响应统一处理:取 data[0].url 或 b64_json 下载成 Buffer。 */
  private async downloadDoubaoImageResponse(response: Response): Promise<Buffer> {
    const data = await response.json() as { data?: Array<{ b64_json?: string; url?: string }> };
    const first = data.data?.[0];
    if (first?.b64_json) {
      return Buffer.from(first.b64_json, "base64");
    }
    if (first?.url) {
      const imageResponse = await this.fetchWithTimeout(first.url);
      if (!imageResponse.ok) {
        throw new BadRequestException(`IMAGE_PROVIDER_URL_FAILED:${imageResponse.status}`);
      }
      return Buffer.from(await imageResponse.arrayBuffer());
    }

    throw new BadRequestException("IMAGE_PROVIDER_EMPTY_RESPONSE");
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
