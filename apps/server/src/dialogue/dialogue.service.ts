import { BadRequestException, Inject, Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type {
  AIRuntimeModelSelection,
  DialogueMessageItem,
  DialogueStreamEvent,
  DialogueThread,
  SendDialogueMessageRequest,
  SendDialogueMessageResponse,
  WorkbenchSnapshot,
} from "@airoaming/shared";
import { OpenCodeRuntimeService } from "../ai-runtime/opencode-runtime.service.js";
import { ProjectsService } from "../projects/projects.service.js";

interface LocalDialogueThread {
  id: string;
  projectId: string;
  stepKey: string;
  openCodeSessionId: string | null;
  messages: DialogueMessageItem[];
  createdAt: string;
  updatedAt: string;
}

interface DialogueTurn {
  snapshot: WorkbenchSnapshot;
  normalizedStepKey: string;
  thread: LocalDialogueThread;
  userMessage: DialogueMessageItem;
  assistantMessage: DialogueMessageItem;
  prompt: string;
}

const STEP_LABELS: Record<string, string> = {
  project_story: "剧本",
  story_structure: "剧情结构",
  storyboard: "分镜工作台",
  image_candidates: "候选图工作台",
  layout_export: "排版导出",
  asset_package: "素材包",
};

@Injectable()
export class DialogueService {
  private readonly threads = new Map<string, LocalDialogueThread>();

  constructor(
    @Inject(ProjectsService) private readonly projectsService: ProjectsService,
    @Inject(OpenCodeRuntimeService) private readonly openCodeRuntimeService: OpenCodeRuntimeService,
  ) {}

  async getProjectThread(projectId: string, stepKey: string): Promise<DialogueThread> {
    await this.projectsService.getWorkbenchSnapshot(projectId);
    const normalizedStepKey = this.normalizeStepKey(stepKey);
    return this.toThreadDto(this.getOrCreateThread(projectId, normalizedStepKey));
  }

  async sendMessage(
    projectId: string,
    stepKey: string,
    input: SendDialogueMessageRequest,
  ): Promise<SendDialogueMessageResponse> {
    const turn = await this.createDialogueTurn(projectId, stepKey, input);

    try {
      const openCodeSessionId = await this.ensureOpenCodeSession(turn.thread, turn.snapshot);
      const response = await this.openCodeRuntimeService.sendMessage({
        sessionId: openCodeSessionId,
        model: input.model,
        content: turn.prompt,
      });
      this.completeAssistantMessage(turn, response.content, response.model);
    } catch (error) {
      this.failAssistantMessage(turn, error);
    }

    return {
      thread: this.toThreadDto(turn.thread),
      userMessage: turn.userMessage,
      assistantMessage: turn.assistantMessage,
    };
  }

  async streamMessage(
    projectId: string,
    stepKey: string,
    input: SendDialogueMessageRequest,
    emit: (event: DialogueStreamEvent) => void | Promise<void>,
  ): Promise<void> {
    const turn = await this.createDialogueTurn(projectId, stepKey, input);
    await emit({
      type: "dialogue.message.created",
      threadId: turn.thread.id,
      messageId: turn.assistantMessage.id,
      thread: this.toThreadDto(turn.thread),
      userMessage: turn.userMessage,
      assistantMessage: turn.assistantMessage,
      createdAt: new Date().toISOString(),
    });

    try {
      const openCodeSessionId = await this.ensureOpenCodeSession(turn.thread, turn.snapshot);
      const response = await this.openCodeRuntimeService.streamMessage(
        {
          sessionId: openCodeSessionId,
          model: input.model,
          content: turn.prompt,
        },
        {
          onDelta: async (delta, content) => {
            turn.assistantMessage.content = content;
            turn.thread.updatedAt = new Date().toISOString();
            await emit({
              type: "dialogue.message.delta",
              threadId: turn.thread.id,
              messageId: turn.assistantMessage.id,
              delta,
              content,
              createdAt: new Date().toISOString(),
            });
          },
        },
      );
      this.completeAssistantMessage(turn, response.content, response.model);
      await emit({
        type: "dialogue.message.completed",
        threadId: turn.thread.id,
        messageId: turn.assistantMessage.id,
        thread: this.toThreadDto(turn.thread),
        assistantMessage: turn.assistantMessage,
        content: turn.assistantMessage.content,
        createdAt: new Date().toISOString(),
      });
    } catch (error) {
      this.failAssistantMessage(turn, error);
      await emit({
        type: "dialogue.error",
        threadId: turn.thread.id,
        messageId: turn.assistantMessage.id,
        thread: this.toThreadDto(turn.thread),
        assistantMessage: turn.assistantMessage,
        error: turn.assistantMessage.error ?? {
          code: "OPENCODE_DIALOGUE_FAILED",
          message: "OpenCode dialogue failed",
        },
        createdAt: new Date().toISOString(),
      });
    }
  }

  private async createDialogueTurn(
    projectId: string,
    stepKey: string,
    input: SendDialogueMessageRequest,
  ): Promise<DialogueTurn> {
    const snapshot = await this.projectsService.getWorkbenchSnapshot(projectId);
    const normalizedStepKey = this.normalizeStepKey(input.stepKey ?? stepKey);
    const content = input.content.trim();
    if (!content) {
      throw new BadRequestException("DIALOGUE_MESSAGE_REQUIRED");
    }

    const thread = this.getOrCreateThread(projectId, normalizedStepKey);
    const now = new Date().toISOString();
    const userMessage: DialogueMessageItem = {
      id: randomUUID(),
      projectId,
      threadId: thread.id,
      stepKey: normalizedStepKey,
      role: "user",
      content,
      status: "completed",
      model: null,
      error: null,
      createdAt: now,
      completedAt: now,
    };
    const assistantMessage: DialogueMessageItem = {
      id: randomUUID(),
      projectId,
      threadId: thread.id,
      stepKey: normalizedStepKey,
      role: "assistant",
      content: "",
      status: "running",
      model: input.model ?? this.openCodeRuntimeService.getDefaultModel(),
      error: null,
      createdAt: now,
      completedAt: null,
    };

    thread.messages.push(userMessage, assistantMessage);
    thread.updatedAt = now;

    return {
      snapshot,
      normalizedStepKey,
      thread,
      userMessage,
      assistantMessage,
      prompt: this.buildPrompt({
        snapshot,
        stepKey: normalizedStepKey,
        userContent: content,
        recentMessages: thread.messages.slice(-12),
      }),
    };
  }

  private completeAssistantMessage(
    turn: DialogueTurn,
    content: string,
    model: AIRuntimeModelSelection,
  ): void {
    turn.assistantMessage.content = content;
    turn.assistantMessage.model = model;
    turn.assistantMessage.status = "completed";
    turn.assistantMessage.completedAt = new Date().toISOString();
    turn.thread.updatedAt = turn.assistantMessage.completedAt;
  }

  private failAssistantMessage(turn: DialogueTurn, error: unknown): void {
    turn.assistantMessage.status = "failed";
    turn.assistantMessage.content = turn.assistantMessage.content || "OpenCode 对话失败，请检查本地 OpenCode 服务和模型配置后重试。";
    turn.assistantMessage.error = {
      code: "OPENCODE_DIALOGUE_FAILED",
      message: error instanceof Error ? error.message : "OpenCode dialogue failed",
    };
    turn.assistantMessage.completedAt = new Date().toISOString();
    turn.thread.updatedAt = turn.assistantMessage.completedAt;
  }

  private async ensureOpenCodeSession(thread: LocalDialogueThread, snapshot: WorkbenchSnapshot): Promise<string> {
    if (thread.openCodeSessionId) {
      return thread.openCodeSessionId;
    }

    thread.openCodeSessionId = await this.openCodeRuntimeService.createSession(`${snapshot.project.name} · 对话框`);
    thread.updatedAt = new Date().toISOString();
    return thread.openCodeSessionId;
  }

  private getOrCreateThread(projectId: string, stepKey: string): LocalDialogueThread {
    const threadKey = this.getThreadKey(projectId, stepKey);
    const existing = this.threads.get(threadKey);
    if (existing) {
      return existing;
    }

    const now = new Date().toISOString();
    const thread: LocalDialogueThread = {
      id: randomUUID(),
      projectId,
      stepKey,
      openCodeSessionId: null,
      messages: [],
      createdAt: now,
      updatedAt: now,
    };
    this.threads.set(threadKey, thread);
    return thread;
  }

  private toThreadDto(thread: LocalDialogueThread): DialogueThread {
    return {
      id: thread.id,
      projectId: thread.projectId,
      currentStepKey: thread.stepKey,
      messages: thread.messages,
      createdAt: thread.createdAt,
      updatedAt: thread.updatedAt,
    };
  }

  private normalizeStepKey(stepKey: string): string {
    if (stepKey === "story") {
      return "project_story";
    }

    return STEP_LABELS[stepKey] ? stepKey : "project_story";
  }

  private getThreadKey(projectId: string, stepKey: string): string {
    return `${projectId}:${stepKey}`;
  }

  private buildPrompt(input: {
    snapshot: WorkbenchSnapshot;
    stepKey: string;
    userContent: string;
    recentMessages: DialogueMessageItem[];
  }): string {
    const stepLabel = STEP_LABELS[input.stepKey] ?? "剧本";
    const currentChapter = input.snapshot.currentChapter;
    const chapterTitle = currentChapter?.title || input.snapshot.story.title || "当前章节";
    const sourceText = (currentChapter?.sourceText ?? input.snapshot.story.sourceText).trim();
    const recentDialogue = input.recentMessages
      .filter((message) => message.content.trim())
      .map((message) => `${message.role === "user" ? "用户" : "AI"}（${STEP_LABELS[message.stepKey] ?? message.stepKey}）：${message.content}`)
      .join("\n");

    return [
      "你是 AI漫游的漫画创作助手，当前运行在项目工作区的左侧对话框。",
      `当前项目：${input.snapshot.project.name}`,
      `当前步骤：${stepLabel}`,
      `当前章节：${chapterTitle}`,
      "工作原则：",
      "1. 只提供建议、总结、提问、结构化分析或改写草案。",
      "2. 不要声称你已经修改了右侧剧本文档。",
      "3. 如给出改写版本，必须明确标注为“改写草案”，由用户决定是否应用。",
      "4. 回复使用中文，优先围绕漫画剧本创作、人物目标、冲突、节奏和画面化表达。",
      "当前章节剧本文档：",
      sourceText || "（用户还没有填写剧本内容）",
      "最近对话：",
      recentDialogue || "（暂无历史对话）",
      "用户本次消息：",
      input.userContent,
    ].join("\n\n");
  }
}
