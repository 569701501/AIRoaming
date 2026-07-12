import { Global, Module } from "@nestjs/common";
import { MaintenanceAdminController } from "./maintenance-admin.controller.js";
import { MaintenanceCoordinator } from "./maintenance-coordinator.service.js";

@Global()
@Module({
  controllers: [MaintenanceAdminController],
  providers: [MaintenanceCoordinator],
  exports: [MaintenanceCoordinator],
})
export class MaintenanceModule {}

