import { Body, Controller, Get, Inject, Param, Post, Query, Res } from "@nestjs/common";
import type { DialogueStreamEvent, SendDialogueMessageRequest } from "@airoaming/shared";
import { ok } from "../http.js";
import { DialogueService } from "./dialogue.service.js";

interface SseResponse {
  setHeader(name: string, value: string): void;
  write(chunk: string): void;
  end(): void;
  on(event: "close", listener: () => void): void;
  flushHeaders?: () => void;
}

@Controller("projects/:projectId/dialogue")
export class DialogueController {
  constructor(@Inject(DialogueService) private readonly dialogueService: DialogueService) {}

  @Get("threads/:stepKey")
  async thread(
    @Param("projectId") projectId: string,
    @Param("stepKey") stepKey: string,
    @Query("chapterId") chapterId?: string,
  ) {
    return ok({
      thread: await this.dialogueService.getProjectThread(projectId, stepKey, chapterId ?? null),
    });
  }

  @Post("threads/:stepKey/messages")
  async send(
    @Param("projectId") projectId: string,
    @Param("stepKey") stepKey: string,
    @Body() body: SendDialogueMessageRequest,
  ) {
    return ok(await this.dialogueService.sendMessage(projectId, stepKey, body));
  }

  @Post("threads/:stepKey/messages/stream")
  async sendStream(
    @Param("projectId") projectId: string,
    @Param("stepKey") stepKey: string,
    @Body() body: SendDialogueMessageRequest,
    @Res() response: SseResponse,
  ) {
    response.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    response.setHeader("Cache-Control", "no-cache, no-transform");
    response.setHeader("Connection", "keep-alive");
    response.setHeader("X-Accel-Buffering", "no");
    response.flushHeaders?.();

    let closed = false;
    let settled = false;
    const requestAbortController = new AbortController();
    response.on("close", () => {
      closed = true;
      if (!settled) {
        requestAbortController.abort();
      }
    });

    const writeEvent = (event: DialogueStreamEvent) => {
      if (closed) {
        return;
      }
      response.write(`event: ${event.type}\n`);
      response.write(`data: ${JSON.stringify(event)}\n\n`);
    };

    try {
      await this.dialogueService.streamMessage(projectId, stepKey, body, writeEvent, requestAbortController.signal);
    } catch (error) {
      writeEvent({
        type: "dialogue.error",
        threadId: "unknown",
        error: {
          code: "DIALOGUE_STREAM_FAILED",
          message: error instanceof Error ? error.message : "Dialogue stream failed",
        },
        createdAt: new Date().toISOString(),
      });
    } finally {
      settled = true;
      if (!closed) {
        response.end();
      }
    }
  }
}
