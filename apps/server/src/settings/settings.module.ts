import { Module } from "@nestjs/common";
import { WorkspaceModule } from "../workspace/workspace.module.js";
import { PersistenceModule } from "../persistence/persistence.module.js";
import { SettingsController } from "./settings.controller.js";
import { SettingsService } from "./settings.service.js";
import { SecretStoreService } from "./secret-store.js";
import { CredentialService } from "./credential.service.js";

@Module({
  imports: [WorkspaceModule, PersistenceModule],
  controllers: [SettingsController],
  providers: [SettingsService, SecretStoreService, CredentialService],
  exports: [SettingsService, SecretStoreService, CredentialService],
})
export class SettingsModule {}
