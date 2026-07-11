import type { INestApplicationContext } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { randomBytes } from "node:crypto";
import { existsSync, realpathSync, statSync } from "node:fs";
import { lstat, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir, userInfo } from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { vi, type MockInstance } from "vitest";
import type {
  CompleteChapterResponse,
  CreateGenerationTaskRequest,
  GenerationTaskItem,
  StoryboardJson,
  StoryStructureJson,
  WorkbenchSnapshot,
} from "@airoaming/shared";
import { TasksService } from "../../tasks/tasks.service.js";
import { ImageProviderService } from "../image-provider.service.js";
import { ProjectsModule } from "../projects.module.js";
import { ProjectsService } from "../projects.service.js";

const FIXTURE_TIME = "2026-07-11T00:00:00.000Z";
const ONE_PIXEL_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);
const FIXTURE_ENV_NAMES = [
  "AIROAMING_WORKSPACE_ROOT",
  "AIROAMING_DATA_ROOT",
  "AIROAMING_SECRET_STORE_ADAPTER",
  "AIROAMING_FAKE_SECRET_STORE_ROOT",
  "OPENCODE_AUTO_START",
  "OPENAI_IMAGE_API_KEY",
  "GROK_IMAGE_API_KEY",
  "OPENAI_API_KEY",
  "ARK_API_KEY",
  "DOUBAO_API_KEY",
  "XAI_API_KEY",
  "DATABASE_URL",
  "AIROAMING_PERSISTENCE_MODE",
  "AIROAMING_MAINTENANCE_MODE",
  "HOME",
  "XDG_CONFIG_HOME",
  "XDG_CACHE_HOME",
] as const;
const PROJECT_ROOT = realpathSync(path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../../../",
));
const ACCOUNT_HOME = realpathSync(userInfo().homedir);

interface SevenStageFixtureMarker {
  schemaVersion: 1;
  kind: "airoaming-seven-stage-test-root";
  runId: string;
  testRoot: string;
  workspaceRoot: string;
  dataRoot: string;
  fakeSecretStoreRoot: string;
}

export interface SevenStageProjectRef {
  projectId: string;
  chapterId: string;
}

export interface StoryFixtureOptions {
  withLeadCharacter?: boolean;
  shotCount?: number;
  shotOrder?: number[];
}

/**
 * 七阶段 Service characterization 的最小运行壳。
 *
 * 业务动作只走 ProjectsService / TasksService；只有真正会出公网的图片
 * provider 被替换为确定性 fake。workspace、Repository、Nest 生命周期和文件读写均为真实实现。
 */
export class SevenStageFixture {
  readonly runId: string;
  readonly tempRoot: string;
  readonly testRoot: string;
  readonly workspaceRoot: string;
  readonly dataRoot: string;
  readonly fakeSecretStoreRoot: string;
  readonly markerPath: string;

  private app: INestApplicationContext | null = null;
  private providerSpies: MockInstance[] = [];
  private readonly previousEnvironment = new Map<string, string | undefined>(
    FIXTURE_ENV_NAMES.map((name) => [name, process.env[name]] as const),
  );

  projects!: ProjectsService;
  tasks!: TasksService;

  constructor(tempRoot = tmpdir()) {
    this.runId = `${process.pid}-${Date.now().toString(36)}-${randomBytes(4).toString("hex")}`;
    this.tempRoot = canonicalizeExistingDirectory(tempRoot, "SEVEN_STAGE_FIXTURE_TEMP_ROOT_INVALID");
    assertSafeFixtureTempRoot(this.tempRoot, this.runId);
    this.testRoot = path.join(this.tempRoot, `airoaming-seven-stage-${this.runId}`);
    this.workspaceRoot = path.join(this.testRoot, "workspace");
    this.dataRoot = path.join(this.testRoot, "data");
    this.fakeSecretStoreRoot = path.join(this.testRoot, "fake-secret-store");
    this.markerPath = path.join(this.testRoot, ".airoaming-test-root");
  }

  async start(): Promise<this> {
    try {
      await this.prepareIsolation();
      this.applyIsolationEnvironment();
      this.app = await NestFactory.createApplicationContext(ProjectsModule, { logger: false });
      this.projects = this.app.get(ProjectsService);
      this.tasks = this.app.get(TasksService);

      const imageProvider = this.app.get(ImageProviderService);
      this.providerSpies = [
        vi.spyOn(imageProvider, "getActiveProviderType").mockReturnValue("grok"),
        vi.spyOn(imageProvider, "generateCandidateImage").mockResolvedValue({
          buffer: ONE_PIXEL_PNG,
          generationMode: "image_generation",
          usedReferenceAssetIds: [],
          warnings: [],
        }),
      ];
      return this;
    } catch (error) {
      const errors: unknown[] = [error];
      try {
        await this.closeApplication();
      } catch (closeError) {
        errors.push(closeError);
      } finally {
        this.restoreEnvironment();
      }
      try {
        await this.cleanupIsolation();
      } catch (cleanupError) {
        errors.push(cleanupError);
      }
      if (errors.length > 1) {
        throw new AggregateError(
          errors,
          errors.map((item) => item instanceof Error ? item.message : String(item)).join(";"),
        );
      }
      throw error;
    }
  }

  async reopen(): Promise<void> {
    try {
      await this.closeApplication();
    } catch (error) {
      this.restoreEnvironment();
      throw error;
    }
    await this.start();
  }

  async dispose(): Promise<void> {
    try {
      await this.closeApplication();
    } finally {
      this.restoreEnvironment();
      await this.cleanupIsolation();
    }
  }

  async createProject(name = "七阶段行为刻画项目"): Promise<SevenStageProjectRef> {
    const project = await this.projects.createProject({
      name,
      type: "comic",
      storyTitle: "雨夜来信",
      comicFormat: "vertical_scroll",
      artStyle: "comic_style",
      description: "用于锁定七阶段当前正确行为",
    });
    const snapshot = await this.projects.getWorkbenchSnapshot(project.id);
    if (!snapshot.currentChapter) {
      throw new Error("FIXTURE_DEFAULT_CHAPTER_MISSING");
    }
    return { projectId: project.id, chapterId: snapshot.currentChapter.id };
  }

  async completeScript(ref: SevenStageProjectRef): Promise<CompleteChapterResponse> {
    return this.projects.completeChapter(ref.projectId, ref.chapterId, {
      sourceText: "# 第一章：雨夜来信\n\n阿澈在雨夜收到一封没有署名的信。",
      title: "第一章：雨夜来信",
      summary: "匿名信引导阿澈前往旧站",
      createNextChapter: false,
    });
  }

  async confirmStructure(ref: SevenStageProjectRef, options: StoryFixtureOptions = {}): Promise<void> {
    await this.projects.confirmChapterStoryStructure(ref.projectId, ref.chapterId, {
      structureJson: buildStoryStructure(ref.chapterId, options.withLeadCharacter ?? false),
    });
  }

  async savePendingStoryboard(
    ref: SevenStageProjectRef,
    options: StoryFixtureOptions = {},
  ): Promise<StoryboardJson> {
    const storyboardJson = await this.buildStoryboard(ref, options);
    await this.projects.savePendingChapterStoryboard(ref.projectId, ref.chapterId, { storyboardJson });
    return storyboardJson;
  }

  async confirmStoryboard(
    ref: SevenStageProjectRef,
    options: StoryFixtureOptions = {},
  ): Promise<StoryboardJson> {
    const storyboardJson = await this.buildStoryboard(ref, options);
    await this.projects.confirmChapterStoryboard(ref.projectId, ref.chapterId, { storyboardJson });
    return storyboardJson;
  }

  async confirmPendingStoryboard(ref: SevenStageProjectRef): Promise<void> {
    const pending = await this.projects.getPendingChapterStoryboard(ref.projectId, ref.chapterId);
    if (!pending) {
      throw new Error("FIXTURE_PENDING_STORYBOARD_MISSING");
    }
    await this.projects.confirmChapterStoryboard(ref.projectId, ref.chapterId, {
      storyboardJson: pending.storyboardJson,
    });
  }

  async generateCandidate(
    ref: SevenStageProjectRef,
    shotId: string,
  ): Promise<GenerationTaskItem> {
    const request: CreateGenerationTaskRequest = {
      projectId: ref.projectId,
      type: "image_generate",
      target: { type: "shot", id: shotId, chapterId: ref.chapterId },
      input: { chapterId: ref.chapterId, shotId, candidateCount: 1 },
    };
    const created = await this.tasks.create(request);
    return waitForTerminalTask(this.tasks, created.id);
  }

  async snapshot(ref: SevenStageProjectRef): Promise<WorkbenchSnapshot> {
    return this.projects.getWorkbenchSnapshot(ref.projectId, ref.chapterId);
  }

  private async buildStoryboard(
    ref: SevenStageProjectRef,
    options: StoryFixtureOptions,
  ): Promise<StoryboardJson> {
    const snapshot = await this.snapshot(ref);
    const characterId = options.withLeadCharacter
      ? snapshot.storyStructure?.structureJson.characters[0]?.projectCharacterId ?? null
      : null;
    if (options.withLeadCharacter && !characterId) {
      throw new Error("FIXTURE_LEAD_CHARACTER_MISSING");
    }
    return buildStoryboard(
      ref.chapterId,
      options.shotCount ?? 1,
      characterId,
      options.shotOrder,
    );
  }

  private async closeApplication(): Promise<void> {
    for (const spy of this.providerSpies) {
      spy.mockRestore();
    }
    this.providerSpies = [];
    await this.app?.close();
    this.app = null;
  }

  private async prepareIsolation(): Promise<void> {
    this.assertCanonicalParent();
    const rootStat = await tryLstat(this.testRoot);
    if (rootStat?.isSymbolicLink() || (rootStat && !rootStat.isDirectory())) {
      throw new Error("SEVEN_STAGE_FIXTURE_ROOT_UNSAFE");
    }
    if (!rootStat) {
      await mkdir(this.testRoot, { recursive: false });
    }

    const markerStat = await tryLstat(this.markerPath);
    if (!markerStat) {
      const entries = await readdir(this.testRoot);
      if (entries.length > 0) {
        throw new Error("SEVEN_STAGE_FIXTURE_ROOT_UNMARKED");
      }
      const marker: SevenStageFixtureMarker = {
        schemaVersion: 1,
        kind: "airoaming-seven-stage-test-root",
        runId: this.runId,
        testRoot: this.testRoot,
        workspaceRoot: this.workspaceRoot,
        dataRoot: this.dataRoot,
        fakeSecretStoreRoot: this.fakeSecretStoreRoot,
      };
      await writeFile(this.markerPath, `${JSON.stringify(marker, null, 2)}\n`, {
        encoding: "utf8",
        flag: "wx",
        mode: 0o600,
      });
    } else {
      await this.assertMatchingMarker(false);
    }

    for (const ownedRoot of [this.workspaceRoot, this.dataRoot, this.fakeSecretStoreRoot]) {
      const ownedStat = await tryLstat(ownedRoot);
      if (ownedStat?.isSymbolicLink() || (ownedStat && !ownedStat.isDirectory())) {
        throw new Error("SEVEN_STAGE_FIXTURE_OWNED_ROOT_UNSAFE");
      }
      if (!ownedStat) {
        await mkdir(ownedRoot, { recursive: false });
      }
    }
    for (const [ownedRoot, errorCode] of [
      [path.join(this.testRoot, "home"), "SEVEN_STAGE_FIXTURE_HOME_ROOT_UNSAFE"],
      [path.join(this.testRoot, "xdg-config"), "SEVEN_STAGE_FIXTURE_XDG_CONFIG_ROOT_UNSAFE"],
      [path.join(this.testRoot, "xdg-cache"), "SEVEN_STAGE_FIXTURE_XDG_CACHE_ROOT_UNSAFE"],
    ] as const) {
      const ownedStat = await tryLstat(ownedRoot);
      if (ownedStat?.isSymbolicLink() || (ownedStat && !ownedStat.isDirectory())) {
        throw new Error(errorCode);
      }
      if (!ownedStat) {
        await mkdir(ownedRoot, { recursive: false });
      }
    }
    const databaseDirectory = path.join(this.dataRoot, "db");
    const databaseDirectoryStat = await tryLstat(databaseDirectory);
    if (
      databaseDirectoryStat?.isSymbolicLink()
      || (databaseDirectoryStat && !databaseDirectoryStat.isDirectory())
    ) {
      throw new Error("SEVEN_STAGE_FIXTURE_DATABASE_DIR_UNSAFE");
    }
    if (!databaseDirectoryStat) {
      await mkdir(databaseDirectory, { recursive: false });
    }
    await this.assertMatchingMarker(true);

    const sentinelPath = path.join(this.fakeSecretStoreRoot, "image-provider.secret");
    const sentinel = `airoaming-test-secret-${this.runId}`;
    const sentinelStat = await tryLstat(sentinelPath);
    if (!sentinelStat) {
      await writeFile(sentinelPath, sentinel, { encoding: "utf8", flag: "wx", mode: 0o600 });
    } else if (
      !sentinelStat.isFile()
      || sentinelStat.isSymbolicLink()
      || await readFile(sentinelPath, "utf8") !== sentinel
    ) {
      throw new Error("SEVEN_STAGE_FIXTURE_SECRET_MISMATCH");
    }
  }

  private applyIsolationEnvironment(): void {
    Object.assign(process.env, {
      AIROAMING_WORKSPACE_ROOT: this.workspaceRoot,
      AIROAMING_DATA_ROOT: this.dataRoot,
      AIROAMING_SECRET_STORE_ADAPTER: "fake",
      AIROAMING_FAKE_SECRET_STORE_ROOT: this.fakeSecretStoreRoot,
      DATABASE_URL: `file:${path.join(this.dataRoot, "db", "airoaming.sqlite")}`,
      AIROAMING_PERSISTENCE_MODE: "file",
      OPENCODE_AUTO_START: "false",
      HOME: path.join(this.testRoot, "home"),
      XDG_CONFIG_HOME: path.join(this.testRoot, "xdg-config"),
      XDG_CACHE_HOME: path.join(this.testRoot, "xdg-cache"),
    });
    for (const name of [
      "OPENAI_IMAGE_API_KEY",
      "GROK_IMAGE_API_KEY",
      "OPENAI_API_KEY",
      "ARK_API_KEY",
      "DOUBAO_API_KEY",
      "XAI_API_KEY",
      "AIROAMING_MAINTENANCE_MODE",
    ]) {
      delete process.env[name];
    }
  }

  private restoreEnvironment(): void {
    for (const [name, previous] of this.previousEnvironment) {
      if (previous === undefined) {
        delete process.env[name];
      } else {
        process.env[name] = previous;
      }
    }
  }

  private async cleanupIsolation(): Promise<void> {
    this.assertCanonicalParent();
    if (!await tryLstat(this.testRoot)) {
      return;
    }
    await this.assertMatchingMarker(true);
    await this.assertMatchingMarker(true);
    this.assertCanonicalParent();
    await rm(this.testRoot, { recursive: true, force: false });
  }

  private async assertMatchingMarker(requireOwnedRoots: boolean): Promise<void> {
    const rootStat = await tryLstat(this.testRoot);
    const markerStat = await tryLstat(this.markerPath);
    if (
      !rootStat?.isDirectory()
      || rootStat.isSymbolicLink()
      || !markerStat?.isFile()
      || markerStat.isSymbolicLink()
    ) {
      throw new Error("SEVEN_STAGE_FIXTURE_MARKER_MISMATCH");
    }
    let marker: Partial<SevenStageFixtureMarker>;
    try {
      marker = JSON.parse(await readFile(this.markerPath, "utf8")) as Partial<SevenStageFixtureMarker>;
    } catch {
      throw new Error("SEVEN_STAGE_FIXTURE_MARKER_MISMATCH");
    }
    if (
      marker.schemaVersion !== 1
      || marker.kind !== "airoaming-seven-stage-test-root"
      || marker.runId !== this.runId
      || path.resolve(marker.testRoot ?? "") !== this.testRoot
      || path.resolve(marker.workspaceRoot ?? "") !== this.workspaceRoot
      || path.resolve(marker.dataRoot ?? "") !== this.dataRoot
      || path.resolve(marker.fakeSecretStoreRoot ?? "") !== this.fakeSecretStoreRoot
    ) {
      throw new Error("SEVEN_STAGE_FIXTURE_MARKER_MISMATCH");
    }
    if (requireOwnedRoots) {
      for (const ownedRoot of [
        this.workspaceRoot,
        this.dataRoot,
        this.fakeSecretStoreRoot,
        path.join(this.testRoot, "home"),
        path.join(this.testRoot, "xdg-config"),
        path.join(this.testRoot, "xdg-cache"),
      ]) {
        const ownedStat = await tryLstat(ownedRoot);
        if (!ownedStat?.isDirectory() || ownedStat.isSymbolicLink()) {
          throw new Error("SEVEN_STAGE_FIXTURE_MARKER_MISMATCH");
        }
      }
    }
  }

  private assertCanonicalParent(): void {
    const canonicalParent = canonicalizeExistingDirectory(
      path.dirname(this.testRoot),
      "SEVEN_STAGE_FIXTURE_TEMP_ROOT_INVALID",
    );
    if (canonicalParent !== this.tempRoot || path.dirname(this.testRoot) !== this.tempRoot) {
      throw new Error("SEVEN_STAGE_FIXTURE_TEMP_ROOT_CANONICAL_MISMATCH");
    }
  }
}

async function tryLstat(target: string) {
  try {
    return await lstat(target);
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

function assertSafeFixtureTempRoot(tempRoot: string, runId: string): void {
  const candidate = path.join(tempRoot, `airoaming-seven-stage-${runId}`);
  const filesystemRoot = path.parse(candidate).root;
  const dangerousRoots = [
    ACCOUNT_HOME,
    canonicalizePotentialPath(PROJECT_ROOT),
    canonicalizePotentialPath(path.join(PROJECT_ROOT, "workspace")),
  ];
  if (process.env.AIROAMING_DATA_ROOT) {
    dangerousRoots.push(canonicalizePotentialPath(process.env.AIROAMING_DATA_ROOT));
  }
  if (
    path.dirname(candidate) === filesystemRoot
    || dangerousRoots.some((dangerous) => samePath(candidate, dangerous) || isPathInside(dangerous, candidate))
  ) {
    throw new Error("SEVEN_STAGE_FIXTURE_TEMP_ROOT_DANGEROUS");
  }
}

function canonicalizeExistingDirectory(input: string, errorCode: string): string {
  try {
    const canonical = realpathSync(path.resolve(input));
    if (!statSync(canonical).isDirectory()) {
      throw new Error(errorCode);
    }
    return canonical;
  } catch (error) {
    if (error instanceof Error && error.message === errorCode) {
      throw error;
    }
    throw new Error(errorCode);
  }
}

function canonicalizePotentialPath(input: string): string {
  const resolved = path.resolve(input);
  if (existsSync(resolved)) {
    return realpathSync(resolved);
  }
  const suffix: string[] = [];
  let cursor = resolved;
  while (!existsSync(cursor)) {
    const parent = path.dirname(cursor);
    if (parent === cursor) {
      return resolved;
    }
    suffix.unshift(path.basename(cursor));
    cursor = parent;
  }
  return path.join(realpathSync(cursor), ...suffix);
}

function samePath(left: string, right: string): boolean {
  return path.resolve(left) === path.resolve(right);
}

function isPathInside(parent: string, candidate: string): boolean {
  const relative = path.relative(path.resolve(parent), path.resolve(candidate));
  return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
}

export function buildStoryStructure(chapterId: string, withLeadCharacter: boolean): StoryStructureJson {
  return {
    schemaVersion: 1,
    chapterId,
    chapterTitle: "第一章：雨夜来信",
    sourceScriptVersionId: null,
    synopsis: "阿澈循着匿名信寻找雨夜里的真相。",
    direction: {
      logline: "一封匿名信引出旧案线索。",
      chapterGoal: "找到寄信人留下的第一条线索。",
      coreConflict: "阿澈必须在暴雨冲掉痕迹前赶到旧站。",
      emotionalArc: "疑惑到警觉。",
      endingHook: "信封背面浮现新的地址。",
    },
    characters: withLeadCharacter ? [{
      id: "structure_character_001",
      projectCharacterId: null,
      name: "阿澈",
      role: "调查者",
      level: "lead",
      entityType: "human",
      motivation: "查清匿名信来源",
      relationship: "本章主角",
      visualTraits: "黑色短发，深色雨衣",
      notes: "需要稳定角色形象",
    }] : [],
    scenes: [{
      id: "scene_station",
      name: "废弃车站",
      location: "城郊旧车站",
      timeOfDay: "雨夜",
      atmosphere: "潮湿、空旷、警觉",
      purpose: "发现匿名信线索",
      referenceAssetId: null,
    }],
    beats: [{
      id: "beat_letter",
      order: 1,
      title: "追到旧站",
      summary: "阿澈依据信件来到废弃车站。",
      conflict: "暴雨即将冲掉地面的线索。",
      characters: withLeadCharacter ? ["阿澈"] : [],
      sceneId: "scene_station",
      visualFocus: "雨幕中的站台与信封",
      outcome: "阿澈发现下一处地址。",
    }],
    notes: "确定性测试结构",
    createdAt: FIXTURE_TIME,
    updatedAt: FIXTURE_TIME,
  };
}

export function buildStoryboard(
  chapterId: string,
  shotCount: number,
  leadCharacterId: string | null,
  shotOrder?: number[],
): StoryboardJson {
  const orders = shotOrder ?? Array.from({ length: shotCount }, (_, index) => index + 1);
  return {
    schemaVersion: 1,
    chapterId,
    chapterTitle: "第一章：雨夜来信",
    sourceStoryVersionId: null,
    shots: Array.from({ length: shotCount }, (_, index) => {
      const number = index + 1;
      return {
        id: `shot_${String(number).padStart(3, "0")}`,
        order: orders[index] ?? number,
        beatId: "beat_letter",
        sceneId: "scene_station",
        characterIds: leadCharacterId ? [leadCharacterId] : [],
        coreAction: number === 1 ? "阿澈踏上雨夜站台" : "镜头转向信封背面的地址",
        emotion: "警觉",
        shotType: number === 1 ? "wide" : "close_up",
        cameraAngle: "eye_level",
        comic: {
          panelDescription: number === 1 ? "雨幕中的废弃站台" : "被雨滴打湿的信封特写",
          composition: "主体位于画面中央，留出环境叙事空间",
          dialogue: leadCharacterId ? "阿澈：这里还有字。" : "",
          caption: "雨声盖住了远处的脚步。",
          panelRhythm: number === 1 ? "slow" : "normal",
        },
        motion: {
          visualDescription: "镜头保持克制，突出雨夜线索。",
          compositionDesign: "前景雨滴，中景主体，背景站台。",
          cameraMovement: "static",
          frameType: number === 1 ? "atmosphere" : "detail",
          durationMs: 3000,
          durationHint: "约 3s",
          voiceLines: [],
        },
        promptDraft: "雨夜废弃车站，干净漫画画格，不含文字和气泡",
        lockedCandidateId: null,
        status: "ready_for_image",
      };
    }),
    notes: "确定性测试分镜",
    createdAt: FIXTURE_TIME,
    updatedAt: FIXTURE_TIME,
  };
}

export async function waitForTerminalTask(
  tasks: TasksService,
  taskId: string,
): Promise<GenerationTaskItem> {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const task = tasks.get(taskId);
    if (["succeeded", "failed", "cancelled"].includes(task.status)) {
      return task;
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`TASK_DID_NOT_FINISH:${taskId}`);
}
