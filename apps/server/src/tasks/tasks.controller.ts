import { Body, Controller, Get, Inject, Param, Post } from "@nestjs/common";
import type { CreateGenerationTaskRequest } from "@airoaming/shared";
import { ok } from "../http.js";
import { TasksService } from "./tasks.service.js";

@Controller("tasks")
export class TasksController {
  constructor(@Inject(TasksService) private readonly tasksService: TasksService) {}

  @Get()
  list() {
    return ok({ items: this.tasksService.list() });
  }

  @Get(":taskId")
  detail(@Param("taskId") taskId: string) {
    return ok({ task: this.tasksService.get(taskId) });
  }

  @Post()
  create(@Body() body: CreateGenerationTaskRequest) {
    return ok({ task: this.tasksService.create(body) });
  }

  @Post(":taskId/cancel")
  cancel(@Param("taskId") taskId: string) {
    return ok({ task: this.tasksService.cancel(taskId) });
  }
}
