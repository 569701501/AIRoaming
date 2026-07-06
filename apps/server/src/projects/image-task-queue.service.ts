import { Injectable, Logger } from "@nestjs/common";

/**
 * 进程内串行图片任务队列（见 2026-07-06 候选图工作台MVP方案 第 5.5 节）。
 *
 * 从 CharacterReferenceService 的 Promise 链抽出：角色参考图、场景参考图、
 * 候选图任务共用同一条串行队列，统一吃图片 provider 的 429/代理超时预算。
 *
 * 已知限制（沿用 MVP 取舍）：内存态，服务重启不恢复未执行任务。
 */
@Injectable()
export class ImageTaskQueue {
  private readonly logger = new Logger(ImageTaskQueue.name);
  private chain: Promise<void> = Promise.resolve();

  /** 入队一个异步任务；任务内部自行处理业务失败（写 task fail），队列只保证不中断。 */
  enqueue(run: () => Promise<void>): void {
    this.chain = this.chain.then(run, run);
    void this.chain.catch((error) => {
      this.logger.error(`Image task queue failed: ${error instanceof Error ? error.message : String(error)}`);
    });
  }
}
