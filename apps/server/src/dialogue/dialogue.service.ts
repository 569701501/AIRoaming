import { BadRequestException, Inject, Injectable, Optional } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type {
  AIRuntimeModelSelection,
  DialogueMessageItem,
  DialogueStreamEvent,
  DialogueThread,
  DialogueToolResult,
  SendDialogueMessageRequest,
  SendDialogueMessageResponse,
  WorkbenchSnapshot,
} from "@airoaming/shared";
import { OpenCodeRuntimeService } from "../ai-runtime/opencode-runtime.service.js";
import { ProjectsService } from "../projects/projects.service.js";
import { ScriptDialogueService } from "./script-dialogue.service.js";
import { StoryStructureDialogueService } from "./story-structure-dialogue.service.js";
import { StoryboardDialogueService } from "./storyboard-dialogue.service.js";
import { shouldGenerateProjectCharacters, shouldOrganizeProvidedScript, formatAttachmentContext } from "./dialogue-intent.util.js";
import { buildPrompt, STEP_LABELS } from "./dialogue-prompt.util.js";
import { getThreadKey } from "./dialogue-key.util.js";
import type {
  DialogueTurn,
  LocalDialogueThread,
} from "./dialogue-types.js";
import { MaintenanceCoordinator } from "../maintenance/maintenance-coordinator.service.js";

@Injectable()
export class DialogueService {
  private readonly threads = new Map<string, LocalDialogueThread>();
  private readonly activeStreamingAssistantMessageIds = new Set<string>();

  constructor(
    @Inject(ProjectsService) private readonly projectsService: ProjectsService,
    @Inject(OpenCodeRuntimeService) private readonly openCodeRuntimeService: OpenCodeRuntimeService,
    @Inject(ScriptDialogueService) private readonly scriptDialogue: ScriptDialogueService,
    @Inject(StoryStructureDialogueService) private readonly storyStructureDialogue: StoryStructureDialogueService,
    @Inject(StoryboardDialogueService) private readonly storyboardDialogue: StoryboardDialogueService,
    @Optional() @Inject(MaintenanceCoordinator) private readonly maintenance?: MaintenanceCoordinator,
  ) {
    this.projectsService.onProjectDeleted((projectId) => this.deleteProjectRuntimeState(projectId));
    this.scriptDialogue.setEnsureSession((thread, snapshot, signal) => this.ensureOpenCodeSession(thread, snapshot, signal));
    this.storyStructureDialogue.setEnsureSession((thread, snapshot, signal) => this.ensureOpenCodeSession(thread, snapshot, signal));
    this.storyboardDialogue.setEnsureSession((thread, snapshot, signal) => this.ensureOpenCodeSession(thread, snapshot, signal));
  }

  async getProjectThread(projectId: string, stepKey: string, chapterId?: string | null): Promise<DialogueThread> {
    await this.projectsService.getWorkbenchSnapshot(projectId, chapterId ?? undefined);
    const normalizedStepKey = this.normalizeStepKey(stepKey);
    const thread = this.getOrCreateThread(projectId, normalizedStepKey, chapterId ?? null);
    this.settleInactiveRunningMessages(thread);
    return this.toThreadDto(thread);
  }

  async sendMessage(
    projectId: string,
    stepKey: string,
    input: SendDialogueMessageRequest,
  ): Promise<SendDialogueMessageResponse> {
    const execute = () => this.sendMessageInternal(projectId, stepKey, input);
    return this.maintenance ? this.maintenance.runMutation("dialogue.send", execute, "dialogue") : execute();
  }

  private async sendMessageInternal(
    projectId: string,
    stepKey: string,
    input: SendDialogueMessageRequest,
  ): Promise<SendDialogueMessageResponse> {
    const turn = await this.createDialogueTurn(projectId, stepKey, input);
    const toolResults = await this.tryHandleScriptTools(turn, input);

    if (toolResults.length > 0) {
      this.recordToolResults(turn.thread, toolResults);
      const lastResult = toolResults[toolResults.length - 1];
      this.completeAssistantMessage(turn, lastResult.summary, input.model ?? this.openCodeRuntimeService.getDefaultModel());
      return {
        thread: this.toThreadDto(turn.thread),
        userMessage: turn.userMessage,
        assistantMessage: turn.assistantMessage,
        toolResults,
      };
    }

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
    signal?: AbortSignal,
  ): Promise<void> {
    const execute = () => this.streamMessageInternal(projectId, stepKey, input, emit, signal);
    return this.maintenance ? this.maintenance.runStream("dialogue.stream", execute) : execute();
  }

  private async streamMessageInternal(
    projectId: string,
    stepKey: string,
    input: SendDialogueMessageRequest,
    emit: (event: DialogueStreamEvent) => void | Promise<void>,
    signal?: AbortSignal,
  ): Promise<void> {
    const turn = await this.createDialogueTurn(projectId, stepKey, input);
    this.activeStreamingAssistantMessageIds.add(turn.assistantMessage.id);
    try {
      await emit({
        type: "dialogue.message.created",
        threadId: turn.thread.id,
        messageId: turn.assistantMessage.id,
        thread: this.toThreadDto(turn.thread),
        userMessage: turn.userMessage,
        assistantMessage: turn.assistantMessage,
        createdAt: new Date().toISOString(),
      });

      const toolResults = await this.tryHandleScriptTools(turn, input, signal);
      if (toolResults.length > 0) {
        this.recordToolResults(turn.thread, toolResults);
        for (const toolResult of toolResults) {
          await emit({
            type: "dialogue.tool_result.created",
            threadId: turn.thread.id,
            messageId: turn.assistantMessage.id,
            thread: this.toThreadDto(turn.thread),
            assistantMessage: turn.assistantMessage,
            toolResult,
            createdAt: new Date().toISOString(),
          });
        }
        const lastResult = toolResults[toolResults.length - 1];
        this.completeAssistantMessage(turn, lastResult.summary, input.model ?? this.openCodeRuntimeService.getDefaultModel());
        await emit({
          type: "dialogue.message.completed",
          threadId: turn.thread.id,
          messageId: turn.assistantMessage.id,
          thread: this.toThreadDto(turn.thread),
          assistantMessage: turn.assistantMessage,
          content: turn.assistantMessage.content,
          createdAt: new Date().toISOString(),
        });
        return;
      }

      const openCodeSessionId = await this.ensureOpenCodeSession(turn.thread, turn.snapshot, signal);
      const response = await this.openCodeRuntimeService.streamMessage(
        {
          sessionId: openCodeSessionId,
          model: input.model,
          content: turn.prompt,
          signal,
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
    } finally {
      this.activeStreamingAssistantMessageIds.delete(turn.assistantMessage.id);
    }
  }

  private async createDialogueTurn(
    projectId: string,
    stepKey: string,
    input: SendDialogueMessageRequest,
  ): Promise<DialogueTurn> {
    const normalizedStepKey = this.normalizeStepKey(input.stepKey ?? stepKey);
    const chapterId = this.resolveDialogueChapterId(normalizedStepKey, input);
    const snapshot = await this.projectsService.getWorkbenchSnapshot(projectId, chapterId ?? undefined);
    const content = input.content.trim();
    if (!content) {
      throw new BadRequestException("DIALOGUE_MESSAGE_REQUIRED");
    }

    const thread = this.getOrCreateThread(projectId, normalizedStepKey, chapterId);
    this.settleInactiveRunningMessages(thread);
    const now = new Date().toISOString();
    const userMessage: DialogueMessageItem = {
      id: randomUUID(),
      projectId,
      threadId: thread.id,
      stepKey: normalizedStepKey,
      chapterId,
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
      chapterId,
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
      prompt: buildPrompt({
        snapshot,
        stepKey: normalizedStepKey,
        userContent: content,
        contextSourceText: input.context?.sourceText,
        attachmentText: formatAttachmentContext(input.attachments as { name: string; mimeType: string; content: string }[] | undefined),
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

  private async ensureOpenCodeSession(thread: LocalDialogueThread, snapshot: WorkbenchSnapshot, signal?: AbortSignal): Promise<string> {
    if (thread.openCodeSessionId) {
      return thread.openCodeSessionId;
    }

    thread.openCodeSessionId = await this.openCodeRuntimeService.createSession(`${snapshot.project.name} · 对话框`, signal);
    thread.updatedAt = new Date().toISOString();
    return thread.openCodeSessionId;
  }

  private getOrCreateThread(projectId: string, stepKey: string, chapterId: string | null): LocalDialogueThread {
    const threadKey = getThreadKey(projectId, stepKey, chapterId);
    const existing = this.threads.get(threadKey);
    if (existing) {
      return existing;
    }

    const now = new Date().toISOString();
    const thread: LocalDialogueThread = {
      id: randomUUID(),
      projectId,
      stepKey,
      chapterId,
      openCodeSessionId: null,
      messages: [],
      toolResults: [],
      createdAt: now,
      updatedAt: now,
    };
    this.threads.set(threadKey, thread);
    return thread;
  }

  private settleInactiveRunningMessages(thread: LocalDialogueThread): void {
    const now = new Date().toISOString();
    let changed = false;

    for (const message of thread.messages) {
      if (
        message.role !== "assistant"
        || message.status !== "running"
        || this.activeStreamingAssistantMessageIds.has(message.id)
      ) {
        continue;
      }

      message.status = "failed";
      message.content = message.content || "上一轮对话连接已中断，请重新发送。";
      message.error = {
        code: "DIALOGUE_STREAM_INTERRUPTED",
        message: "Dialogue stream was interrupted before completion.",
      };
      message.completedAt = now;
      changed = true;
    }

    if (changed) {
      thread.updatedAt = now;
    }
  }

  private deleteProjectRuntimeState(projectId: string): number {
    let deletedCount = 0;
    const deletedThreadIds = new Set<string>();

    for (const [threadKey, thread] of this.threads.entries()) {
      if (thread.projectId !== projectId) {
        continue;
      }

      deletedThreadIds.add(thread.id);
      for (const message of thread.messages) {
        this.activeStreamingAssistantMessageIds.delete(message.id);
      }
      this.threads.delete(threadKey);
      deletedCount += 1;
    }

    for (const threadId of deletedThreadIds) {
      if (this.scriptDialogue.tryDeleteThreadState(threadId)) {
        deletedCount += 1;
      }
    }

    deletedCount += this.scriptDialogue.clearForProject(projectId);
    deletedCount += this.storyStructureDialogue.clearForProject(projectId);
    return deletedCount;
  }

  private toThreadDto(thread: LocalDialogueThread): DialogueThread {
    return {
      id: thread.id,
      projectId: thread.projectId,
      currentStepKey: thread.stepKey,
      chapterId: thread.chapterId,
      messages: thread.messages,
      toolResults: thread.toolResults,
      createdAt: thread.createdAt,
      updatedAt: thread.updatedAt,
    };
  }

  private recordToolResults(thread: LocalDialogueThread, toolResults: DialogueToolResult[]): void {
    const existingIds = new Set(thread.toolResults.map((result) => result.id));
    const nextResults = toolResults.filter((result) => !existingIds.has(result.id));
    if (nextResults.length === 0) {
      return;
    }

    thread.toolResults.push(...nextResults);
    thread.updatedAt = new Date().toISOString();
  }

  private normalizeStepKey(stepKey: string): string {
    if (stepKey === "story") {
      return "project_story";
    }

    return STEP_LABELS[stepKey] ? stepKey : "project_story";
  }

  private resolveDialogueChapterId(stepKey: string, input: SendDialogueMessageRequest): string | null {
    if (stepKey === "project_characters") {
      return null;
    }

    if (stepKey !== "project_story") {
      return input.chapterId ?? null;
    }

    return shouldOrganizeProvidedScript(input)
      || input.intent === "generate_inspiration_seeds"
      || input.intent === "generate_script_outline_from_seed"
      ? null
      : input.chapterId ?? null;
  }

  private async tryHandleScriptTools(
    turn: DialogueTurn,
    input: SendDialogueMessageRequest,
    signal?: AbortSignal,
  ): Promise<DialogueToolResult[]> {
    const projectCharactersResult = await this.tryHandleProjectCharacterTools(turn, input);
    if (projectCharactersResult) {
      return [projectCharactersResult];
    }

    const storyStructureResult = await this.storyStructureDialogue.handleStoryStructureTurn(turn, input, signal);
    if (storyStructureResult) {
      return [storyStructureResult];
    }

    const storyboardResult = await this.storyboardDialogue.handleStoryboardTurn(turn, input, signal);
    if (storyboardResult) {
      return [storyboardResult];
    }

    const scriptResults = await this.scriptDialogue.handleScriptTurn(turn, input, signal);
    if (scriptResults.length > 0) {
      return scriptResults;
    }

    return [];
  }

  private async tryHandleProjectCharacterTools(
    turn: DialogueTurn,
    input: SendDialogueMessageRequest,
  ): Promise<DialogueToolResult | null> {
    if (turn.normalizedStepKey !== "project_characters") {
      return null;
    }

    if (!shouldGenerateProjectCharacters(input)) {
      return null;
    }

    const result = await this.projectsService.extractProjectCharacters(turn.thread.projectId, {
      source: "auto",
    });
    if (result.characters.length === 0) {
      return this.createFailedToolResult(
        turn,
        "generate_project_characters",
        "我没有从已确认剧本大纲或当前章节里识别出可入库角色。可以先在剧本阶段确认大纲，或把主要角色设定发给我再提取。",
      );
    }

    const requiredCount = result.characters.filter((character) =>
      character.level === "lead" || character.level === "recurring",
    ).length;
    return {
      id: randomUUID(),
      projectId: turn.thread.projectId,
      threadId: turn.thread.id,
      messageId: turn.assistantMessage.id,
      toolCallId: randomUUID(),
      tool: "generate_project_characters",
      status: "succeeded",
      summary: [
        `已提取 ${result.characters.length} 个项目角色，其中 ${requiredCount} 个需要确认角色定稿图。`,
        "右侧项目角色库会自动生成角色预览图；主角/常驻角色确认预览并完成定稿后，会在出图准备阶段作为候选图生成的参考图。",
      ].join("\n"),
      chapters: turn.snapshot.chapters,
      currentChapterId: turn.snapshot.currentChapter?.id ?? null,
      currentChapter: turn.snapshot.currentChapter ?? null,
      characters: result.characters,
      revision: null,
      createdAt: new Date().toISOString(),
    };
  }

  private createFailedToolResult(
    turn: DialogueTurn,
    tool: DialogueToolResult["tool"],
    summary: string,
  ): DialogueToolResult {
    return {
      id: randomUUID(),
      projectId: turn.thread.projectId,
      threadId: turn.thread.id,
      messageId: turn.assistantMessage.id,
      toolCallId: randomUUID(),
      tool,
      status: "failed",
      summary,
      chapters: [],
      currentChapterId: turn.snapshot.currentChapter?.id ?? turn.thread.chapterId,
      currentChapter: turn.snapshot.currentChapter ?? null,
      analysis: null,
      inspirationSeeds: null,
      scriptOutline: null,
      revision: null,
      createdAt: new Date().toISOString(),
    };
  }
}
