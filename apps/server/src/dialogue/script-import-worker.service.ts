import { ConflictException, Inject, Injectable, OnModuleDestroy } from "@nestjs/common";
import type { AIRuntimeModelSelection } from "@airoaming/shared";

import {
  ScriptWorkflowSourceRepository,
  type ImportBatchProjection,
} from "../projects/script-workflow-source.repository.js";
import { ScriptImportBatchService } from "./script-import-batch.service.js";

const MAX_AUTOMATIC_ATTEMPTS = 3;

interface ClaimedImportItem {
  projectId: string;
  batchId: string;
  itemId: string;
}

/**
 * 单进程已有剧本导入 Worker。
 *
 * 数据库里的 batch/item 状态是唯一进度来源；内存队列只保存已经原子领取的工作。
 * 服务重启时会把中断中的条目标记为明确失败，并在次数上限内从本章起点重试。
 */
@Injectable()
export class ScriptImportWorkerService implements OnModuleDestroy {
  private started = false;
  private running = false;
  private wakeRequested = false;
  private initialized = false;
  private readonly claimed: ClaimedImportItem[] = [];
  private readonly modelsByBatchId = new Map<string, AIRuntimeModelSelection>();

  constructor(
    @Inject(ScriptWorkflowSourceRepository) private readonly repository: ScriptWorkflowSourceRepository,
    @Inject(ScriptImportBatchService) private readonly batchService: ScriptImportBatchService,
  ) {}

  start(): void {
    if (this.started) return;
    this.started = true;
    this.wakeRequested = true;
    this.triggerRun();
  }

  stop(): void {
    this.started = false;
    this.wakeRequested = false;
  }

  onModuleDestroy(): void {
    this.stop();
  }

  /** 新批次已入库，立即唤醒；确认目录的请求无需等待整批完成。 */
  wake(batchId: string, model?: AIRuntimeModelSelection): void {
    if (model) this.modelsByBatchId.set(batchId, model);
    this.wakeRequested = true;
    this.triggerRun();
  }

  async retry(input: {
    projectId: string;
    batchId: string;
    itemId: string;
    model?: AIRuntimeModelSelection;
  }): Promise<ImportBatchProjection> {
    const projection = await this.repository.getImportBatchProjection(input.projectId, input.batchId);
    const item = projection.items.find((candidate) => candidate.id === input.itemId);
    if (!item || item.status !== "generation_failed") {
      throw new ConflictException("只有整理或忠实度验证失败的章节可以重试");
    }
    const claim = await this.repository.beginImportItem(input.projectId, input.itemId);
    this.claimed.push(claim);
    if (input.model) this.modelsByBatchId.set(input.batchId, input.model);
    this.triggerRun();
    return this.repository.getImportBatchProjection(input.projectId, input.batchId);
  }

  async runOnce(): Promise<void> {
    if (this.running) return;
    this.running = true;
    this.wakeRequested = false;
    let continueBatch = false;
    let processedItem = false;
    let failed = false;
    try {
      await this.initializeRecovery();
      const claim = this.claimed.shift() ?? await this.claimNextQueuedItem();
      if (!claim) return;
      processedItem = true;
      await this.batchService.processClaimedItem({
        projectId: claim.projectId,
        itemId: claim.itemId,
        model: this.modelsByBatchId.get(claim.batchId),
      });
      const projection = await this.repository.getImportBatchProjection(claim.projectId, claim.batchId);
      continueBatch = projection.items.some((item) => item.status === "queued");
      if (!["queued", "processing"].includes(projection.status)) {
        this.modelsByBatchId.delete(claim.batchId);
      }
    } catch {
      failed = true;
      this.initialized = false;
    } finally {
      this.running = false;
      if (this.started && failed) {
        setTimeout(() => {
          if (this.started) this.triggerRun();
        }, 1_000);
      } else if (this.started && (this.claimed.length > 0 || continueBatch || processedItem || this.wakeRequested)) {
        queueMicrotask(() => this.triggerRun());
      }
    }
  }

  private async initializeRecovery(): Promise<void> {
    if (this.initialized) return;
    const interrupted = await this.repository.recoverInterruptedImportItems(MAX_AUTOMATIC_ATTEMPTS);
    for (const item of interrupted) {
      try {
        this.claimed.push(await this.repository.beginImportItem(item.projectId, item.itemId));
      } catch {
        // 可能已由显式重试或另一轮领取，数据库状态会决定后续行为。
      }
    }
    this.initialized = true;
  }

  private async claimNextQueuedItem(): Promise<ClaimedImportItem | null> {
    const next = await this.repository.findNextQueuedImportItem();
    if (!next) return null;
    try {
      return await this.repository.beginImportItem(next.projectId, next.itemId);
    } catch {
      return null;
    }
  }

  private triggerRun(): void {
    void this.runOnce().catch(() => undefined);
  }
}
