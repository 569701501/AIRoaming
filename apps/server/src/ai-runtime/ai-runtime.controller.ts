import { Controller, Get, Inject } from "@nestjs/common";
import { ok } from "../http.js";
import { OpenCodeRuntimeService } from "./opencode-runtime.service.js";

@Controller("ai-runtime")
export class AIRuntimeController {
  constructor(@Inject(OpenCodeRuntimeService) private readonly openCodeRuntimeService: OpenCodeRuntimeService) {}

  @Get("models")
  async models() {
    return ok({
      defaultModel: this.openCodeRuntimeService.getDefaultModel(),
      items: await this.openCodeRuntimeService.listModels(),
    });
  }
}
