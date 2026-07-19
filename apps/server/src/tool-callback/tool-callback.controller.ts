import { Body, Controller, Headers, Inject, Post } from "@nestjs/common";
import { ok } from "../http.js";
import { ToolCallbackService } from "./tool-callback.service.js";

/**
 * 工具回调网关:接收 OpenCode 插件工具的 HTTP 回调,委托业务 service 执行。
 * 参考 AuroraPlatformWeb 的 tool-callback 模块。
 *
 * 鉴权:通过 x-airoaming-tool-token 头校验,防止外部调用。
 * token 来自环境变量 AIROAMING_TOOL_CALLBACK_TOKEN。
 */
@Controller("tool-callback")
export class ToolCallbackController {
  constructor(@Inject(ToolCallbackService) private readonly toolCallbackService: ToolCallbackService) {}

  @Post("generate_character_image")
  async generateCharacterImage(
    @Headers("x-airoaming-tool-token") token: string | undefined,
    @Body() body: { projectId: string; characterName: string; prompt?: string },
  ) {
    this.toolCallbackService.assertToken(token);
    return ok(await this.toolCallbackService.generateCharacterImage(body));
  }

  @Post("generate_character_final")
  async generateCharacterFinal(
    @Headers("x-airoaming-tool-token") token: string | undefined,
    @Body() body: { projectId: string; characterName: string; prompt?: string },
  ) {
    this.toolCallbackService.assertToken(token);
    return ok(await this.toolCallbackService.generateCharacterFinal(body));
  }

  @Post("generate_scene_image")
  async generateSceneImage(
    @Headers("x-airoaming-tool-token") token: string | undefined,
    @Body() body: { projectId: string; chapterId: string; sceneId: string; requestId?: string; prompt?: string },
  ) {
    this.toolCallbackService.assertToken(token);
    return ok(await this.toolCallbackService.generateSceneImage(body));
  }

  @Post("extract_characters")
  async extractCharacters(
    @Headers("x-airoaming-tool-token") token: string | undefined,
    @Body() body: { projectId: string },
  ) {
    this.toolCallbackService.assertToken(token);
    return ok(await this.toolCallbackService.extractCharacters(body));
  }

  @Post("get_project_status")
  async getProjectStatus(
    @Headers("x-airoaming-tool-token") token: string | undefined,
    @Body() body: { projectId: string },
  ) {
    this.toolCallbackService.assertToken(token);
    return ok(await this.toolCallbackService.getProjectStatus(body.projectId));
  }
}
