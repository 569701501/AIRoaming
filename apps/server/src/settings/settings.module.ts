import { Module } from "@nestjs/common";
import { WorkspaceModule } from "../workspace/workspace.module.js";
import { PersistenceModule } from "../persistence/persistence.module.js";
import { SettingsController } from "./settings.controller.js";
import { SettingsService } from "./settings.service.js";
import { SecretStoreService } from "./secret-store.js";

@Module({
  imports: [WorkspaceModule, PersistenceModule],
  controllers: [SettingsController],
  providers: [SettingsService, SecretStoreService],
  exports: [SettingsService],
})
export class SettingsModule {}
