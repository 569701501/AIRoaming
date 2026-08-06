import { Body, Controller, Delete, Get, Inject, Param, Patch, Post, Put } from "@nestjs/common";
import type { AppSettings, CreateManagedModelRequest, UpdateAppSettingsRequest, UpdateManagedModelRequest } from "@airoaming/shared";
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

  @Post("models")
  async createManagedModel(@Body() body: CreateManagedModelRequest) {
    return ok<AppSettings>(await this.settingsService.createManagedModel(body));
  }

  @Patch("models/:id")
  async updateManagedModel(@Param("id") id: string, @Body() body: UpdateManagedModelRequest) {
    return ok<AppSettings>(await this.settingsService.updateManagedModel(id, body));
  }

  @Delete("models/:id")
  async deleteManagedModel(@Param("id") id: string) {
    return ok<AppSettings>(await this.settingsService.deleteManagedModel(id));
  }

  @Put("models/:id/activate")
  async activateManagedModel(@Param("id") id: string) {
    return ok<AppSettings>(await this.settingsService.activateManagedModel(id));
  }
}
