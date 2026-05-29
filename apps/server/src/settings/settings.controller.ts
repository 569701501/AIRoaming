import { Body, Controller, Get, Inject, Patch } from "@nestjs/common";
import type { AppSettings, UpdateAppSettingsRequest } from "@airoaming/shared";
import { ok } from "../http.js";
import { SettingsService } from "./settings.service.js";

@Controller("settings")
export class SettingsController {
  constructor(@Inject(SettingsService) private readonly settingsService: SettingsService) {}

  @Get()
  async getSettings() {
    return ok<AppSettings>(await this.settingsService.getSettings());
  }

  @Patch()
  async updateSettings(@Body() body: UpdateAppSettingsRequest) {
    return ok<AppSettings>(await this.settingsService.updateSettings(body));
  }
}
