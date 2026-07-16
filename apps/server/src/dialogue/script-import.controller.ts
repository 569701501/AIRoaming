import { Body, Controller, Get, Inject, Param, Post } from "@nestjs/common";
import type { RetryScriptImportItemRequest, ScriptImportBatchStatusResponse } from "@airoaming/shared";

import { ok } from "../http.js";
import { ScriptWorkflowSourceRepository } from "../projects/script-workflow-source.repository.js";
import { ScriptImportWorkerService } from "./script-import-worker.service.js";

@Controller("projects/:projectId/script/import-batches")
export class ScriptImportController {
  constructor(
    @Inject(ScriptWorkflowSourceRepository) private readonly repository: ScriptWorkflowSourceRepository,
    @Inject(ScriptImportWorkerService) private readonly worker: ScriptImportWorkerService,
  ) {}

  @Get(":batchId")
  async getBatch(
    @Param("projectId") projectId: string,
    @Param("batchId") batchId: string,
  ) {
    const batch = await this.repository.getImportBatchProjection(projectId, batchId);
    return ok({ batch } satisfies ScriptImportBatchStatusResponse);
  }

  @Post(":batchId/items/:itemId/retry")
  async retryItem(
    @Param("projectId") projectId: string,
    @Param("batchId") batchId: string,
    @Param("itemId") itemId: string,
    @Body() body: RetryScriptImportItemRequest,
  ) {
    const batch = await this.worker.retry({ projectId, batchId, itemId, model: body.model });
    return ok({ batch } satisfies ScriptImportBatchStatusResponse);
  }
}
