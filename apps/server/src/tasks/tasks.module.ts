import { Module } from "@nestjs/common";
import { TasksController } from "./tasks.controller.js";
import { TasksService } from "./tasks.service.js";
import { WorkspaceModule } from "../workspace/workspace.module.js";
import { TaskArtifactService } from "./task-artifact.service.js";
import { PersistenceModule } from "../persistence/persistence.module.js";
import { PersistentTaskRepository } from "./persistent-task.repository.js";
import { PersistentTaskRecoveryService } from "./persistent-task-recovery.service.js";

@Module({
  imports: [WorkspaceModule, PersistenceModule],
  controllers: [TasksController],
  providers: [TasksService, TaskArtifactService, PersistentTaskRepository, PersistentTaskRecoveryService],
  exports: [TasksService, TaskArtifactService, PersistentTaskRepository, PersistentTaskRecoveryService],
})
export class TasksModule {}
