import { Body, Controller, Get, Inject, Param, Post } from "@nestjs/common";
import type { CreateGenerationTaskRequest } from "@airoaming/shared";
import { ok } from "../http.js";
import { TasksService } from "./tasks.service.js";

@Controller("tasks")
export class TasksController {
  constructor(@Inject(TasksService) private readonly tasksService: TasksService) {}

  @Get()
  async list() {
    return ok({ items: await this.tasksService.listForApi() });
  }

  @Get(":taskId")
  async detail(@Param("taskId") taskId: string) {
    return ok(await this.tasksService.getDetailForApi(taskId));
  }

  @Post()
  async create(@Body() body: CreateGenerationTaskRequest) {
    return ok({ task: await this.tasksService.create(body) });
  }

  @Post(":taskId/cancel")
  async cancel(@Param("taskId") taskId: string) {
    return ok({ task: await this.tasksService.cancelForApi(taskId) });
  }
}
