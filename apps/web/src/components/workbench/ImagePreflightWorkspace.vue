<template>
  <section class="image-preflight-workspace" aria-label="出图准备">
    <header class="preflight-toolbar">
      <div class="chapter-picker">
        <ListChecks :size="18" />
        <select :value="currentChapterId ?? ''" :disabled="loading" @change="selectChapter">
          <option v-for="chapter in chapters" :key="chapter.id" :value="chapter.id">
            {{ chapter.title }} · {{ getChapterPreflightLabel(chapter) }}
          </option>
        </select>
        <span v-if="snapshot.project.storyTitle" class="story-title">{{ snapshot.project.storyTitle }}</span>
      </div>

      <div class="preflight-actions">
        <button class="secondary-action" type="button" @click="$emit('openCharacters')">
          <UsersRound :size="15" />
          <span>查看角色库</span>
        </button>
        <button class="primary-action" type="button" :disabled="!nextAction.enabled || loading" @click="runNextAction">
          <component :is="nextActionIcon" :size="15" />
          <span>{{ nextAction.buttonLabel }}</span>
        </button>
      </div>
    </header>

    <div v-if="!hasFormalStoryboard" class="preflight-empty">
      <Lock :size="22" />
      <h2>请先确认本章分镜</h2>
      <p>出图准备只读取正式 storyboard.json。待确认分镜不会进入候选图生成。</p>
    </div>

    <div v-else class="preflight-scroll">
      <section class="preflight-hero" :class="{ 'is-ready': isPreflightConfirmed }">
        <div>
          <span>{{ isPreflightConfirmed ? "本章已可出图" : "本章出图准备" }}</span>
          <h2>{{ currentChapterTitle }} · {{ shots.length }} 镜</h2>
        </div>
        <p>
          这里不会让你维护整套角色库，只处理当前章节进入候选图前必须解决的事情。
        </p>
      </section>

      <section class="preflight-next-card" :class="`is-${nextAction.tone}`">
        <div>
          <span>当前只需要</span>
          <h3>{{ nextAction.title }}</h3>
          <p>{{ nextAction.description }}</p>
        </div>
        <button type="button" :disabled="!nextAction.enabled || loading" @click="runNextAction">
          <component :is="nextActionIcon" :size="15" />
          <span>{{ nextAction.buttonLabel }}</span>
        </button>
      </section>

      <div class="preflight-metrics">
        <div>
          <span>分镜数</span>
          <strong>{{ shots.length }}</strong>
        </div>
        <div>
          <span>已识别角色</span>
          <strong>{{ matchedCharacters.length }}</strong>
        </div>
        <div>
          <span>待确认角色</span>
          <strong>{{ unresolvedTokens.length }}</strong>
        </div>
        <div>
          <span>待锁定角色</span>
          <strong>{{ missingRequiredReferences.length }}</strong>
        </div>
        <div>
          <span>场景问题</span>
          <strong>{{ missingSceneReferences.length }}</strong>
        </div>
      </div>

      <section class="checklist-panel">
        <article v-for="item in checklist" :key="item.key" class="check-item" :class="`is-${item.status}`">
          <component :is="item.status === 'ok' ? CheckCircle2 : AlertCircle" :size="18" />
          <div>
            <strong>{{ item.title }}</strong>
            <p>{{ item.description }}</p>
          </div>
        </article>
      </section>

      <section v-if="unresolvedTokens.length > 0" id="preflight-role-issues" class="issue-panel">
        <div class="panel-heading">
          <AlertCircle :size="16" />
          <h3>先确认这些出镜名称是谁</h3>
        </div>
        <div class="token-action-list">
          <article v-for="token in unresolvedTokens" :key="token" class="token-action-card">
            <div>
              <span>未识别</span>
              <strong>{{ token }}</strong>
            </div>
            <div class="token-actions">
              <button class="mini-action" type="button" :disabled="loading" @click="resolveToken(token, 'add_to_library')">作为本章角色</button>
              <button class="mini-action" type="button" :disabled="loading" @click="resolveToken(token, 'mark_temporary')">设为临时角色</button>
              <button class="mini-action is-danger" type="button" :disabled="loading" @click="resolveToken(token, 'ignore')">不参与出图</button>
            </div>
            <div v-if="mergeTargets.length > 0" class="merge-row">
              <select v-model="selectedMergeTargets[token]" :disabled="loading">
                <option value="">合并到已有角色</option>
                <option v-for="character in mergeTargets" :key="character.id" :value="character.id">
                  {{ character.name }} · {{ getLevelLabel(character.level) }}
                </option>
              </select>
              <button class="mini-action" type="button" :disabled="loading || !selectedMergeTargets[token]" @click="resolveToken(token, 'merge_existing')">确认合并</button>
            </div>
          </article>
        </div>
        <button class="secondary-action" type="button" @click="$emit('openCharacters')">
          <UsersRound :size="14" />
          <span>查看全部角色</span>
        </button>
      </section>

      <section class="role-reference-panel">
        <div class="panel-heading">
          <UsersRound :size="16" />
          <h3>本章角色锁定</h3>
        </div>

        <div v-if="characterChecks.length === 0" class="reference-empty">
          <Image :size="18" />
          <span>当前分镜还没有识别出已入库角色。</span>
        </div>

        <template v-else>
          <div v-if="missingRequiredReferences.length > 0 || runningReferenceTasks.length > 0" class="panel-action-note">
            <div>
              <strong>{{ missingRequiredReferences.length > 0 ? `还有 ${missingRequiredReferences.length} 个角色需要锁定` : "角色图正在生成" }}</strong>
              <span>{{ missingRequiredReferences.length > 0 ? "打开后只显示本章相关角色，使用满意的效果图完成锁定。" : "生成完成后回到这里继续确认出图准备。" }}</span>
            </div>
            <button class="secondary-action" type="button" :disabled="loading" @click="$emit('openCharacters')">
              <UsersRound :size="14" />
              <span>{{ missingRequiredReferences.length > 0 ? "锁定本章角色" : "查看生成进度" }}</span>
            </button>
          </div>

          <div class="character-check-list">
            <article v-for="item in characterChecks" :key="item.character.id" class="character-check-card">
              <div>
                <span>{{ getLevelLabel(item.character.level) }} · 出镜 {{ item.appearanceCount }} 次</span>
                <h4>{{ item.character.name }}</h4>
                <p>{{ getCharacterDescription(item.character) }}</p>
              </div>
              <strong class="reference-state" :class="`is-${item.state}`">{{ item.label }}</strong>
            </article>
          </div>
        </template>
      </section>

      <section id="preflight-scene-issues" class="scene-style-panel">
        <div class="panel-heading">
          <Palette :size="16" />
          <h3>场景与画风</h3>
        </div>

        <div class="scene-style-grid">
          <article>
            <span>漫画形式</span>
            <strong>{{ comicFormatLabel }}</strong>
          </article>
          <article>
            <span>美术风格</span>
            <strong>{{ artStyleLabel }}</strong>
          </article>
        </div>

        <div v-if="missingSceneReferences.length > 0" class="scene-warning-list">
          <article v-for="item in missingSceneReferences" :key="item.shotId">
            <AlertCircle :size="15" />
            <span>{{ item.label }}</span>
          </article>
        </div>

        <div v-if="sceneChecks.length > 0" class="scene-check-list">
          <article v-for="item in sceneChecks" :key="item.scene.id">
            <MapPin :size="15" />
            <div>
              <strong>{{ item.scene.name }}</strong>
              <span>出现在 {{ item.shotCount }} 个镜头</span>
            </div>
          </article>
        </div>

        <div v-else-if="missingSceneReferences.length === 0" class="reference-empty">
          <MapPin :size="18" />
          <span>当前分镜没有绑定场景卡。</span>
        </div>
      </section>

      <section class="shot-bind-panel">
        <div class="panel-heading">
          <Link2 :size="16" />
          <h3>镜头角色绑定</h3>
        </div>
        <div class="shot-bind-list">
          <article v-for="shot in shots" :key="shot.id" class="shot-bind-row">
            <span>镜头 {{ shot.order }}</span>
            <strong>{{ shot.coreAction || shot.comic.panelDescription || "未填写核心动作" }}</strong>
            <small>{{ getShotCharacterLabel(shot) }}</small>
          </article>
        </div>
      </section>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, reactive } from "vue";
import { AlertCircle, ArrowRight, CheckCircle2, Image, Link2, ListChecks, Lock, MapPin, Palette, UsersRound } from "lucide-vue-next";
import type { ChapterListItem, GenerationTaskItem, ProjectCharacter, ResolveImagePreflightCharacterAction, WorkbenchShot, WorkbenchSnapshot } from "@airoaming/shared";

const props = defineProps<{
  snapshot: WorkbenchSnapshot;
  tasks: GenerationTaskItem[];
  loading: boolean;
}>();

const emit = defineEmits<{
  openCharacters: [];
  confirmPreflight: [chapterId: string];
  resolveCharacter: [payload: { chapterId: string; input: { token: string; action: ResolveImagePreflightCharacterAction; targetCharacterId?: string } }];
  goCandidates: [];
  selectChapter: [chapterId: string];
}>();

const chapters = computed(() => props.snapshot.chapters ?? []);
const currentChapter = computed(() => props.snapshot.currentChapter);
const currentChapterId = computed(() => currentChapter.value?.id ?? null);
const currentChapterTitle = computed(() => currentChapter.value?.title ?? "当前章节");
const hasFormalStoryboard = computed(() => Boolean(props.snapshot.storyboard && props.snapshot.storyboard.chapterId === currentChapterId.value));
const shots = computed(() => hasFormalStoryboard.value ? props.snapshot.shots : []);
const characterById = computed(() => new Map(props.snapshot.characters.map((character) => [character.id, character])));
const characterByName = computed(() => new Map(props.snapshot.characters.map((character) => [normalizeToken(character.name), character])));
const selectedMergeTargets = reactive<Record<string, string>>({});
const mergeTargets = computed(() => props.snapshot.characters);
const structureScenes = computed(() => props.snapshot.storyStructure?.structureJson.scenes ?? []);
const sceneById = computed(() => new Map(structureScenes.value.map((scene) => [scene.id, scene])));
const comicFormatLabel = computed(() => getComicFormatLabel(props.snapshot.project.comicFormat));
const artStyleLabel = computed(() => getArtStyleLabel(props.snapshot.project.artStyle));
const styleHasWarning = computed(() => props.snapshot.project.artStyle === "custom");

const shotTokenMatches = computed(() => {
  const matches = new Map<string, ProjectCharacter>();
  const unresolved = new Set<string>();

  for (const shot of shots.value) {
    for (const token of getShotCharacterTokens(shot)) {
      const character = characterById.value.get(token) ?? characterByName.value.get(normalizeToken(token));
      if (character) {
        matches.set(character.id, character);
        continue;
      }
      unresolved.add(token);
    }
  }

  return {
    matched: [...matches.values()],
    unresolved: [...unresolved.values()].sort(),
  };
});

const matchedCharacters = computed(() => shotTokenMatches.value.matched);
const unresolvedTokens = computed(() => shotTokenMatches.value.unresolved);
const appearanceCounts = computed(() => {
  const counts = new Map<string, number>();
  for (const shot of shots.value) {
    const seenInShot = new Set<string>();
    for (const token of getShotCharacterTokens(shot)) {
      const character = characterById.value.get(token) ?? characterByName.value.get(normalizeToken(token));
      if (character) {
        seenInShot.add(character.id);
      }
    }
    for (const characterId of seenInShot) {
      counts.set(characterId, (counts.get(characterId) ?? 0) + 1);
    }
  }
  return counts;
});

const characterChecks = computed(() => matchedCharacters.value.map((character) => {
  const appearanceCount = appearanceCounts.value.get(character.id) ?? 0;
  const required = isRequiredReferenceCharacter(character, appearanceCount);
  const running = isReferenceTaskActive(character);
  const ready = hasFinalReference(character);
  return {
    character,
    appearanceCount,
    required,
    ready,
    running,
    state: ready ? "ready" : running ? "running" : required ? "missing" : "optional",
    label: ready ? "已锁定" : running ? "锁定中" : required ? "待锁定" : "可直接出图",
  };
}));

const missingRequiredReferences = computed(() =>
  characterChecks.value.filter((item) => item.required && !item.ready && !item.running),
);
const runningReferenceTasks = computed(() => characterChecks.value.filter((item) => item.running));
const sceneChecks = computed(() => {
  const counts = new Map<string, number>();
  for (const shot of shots.value) {
    const sceneId = shot.sceneId?.trim();
    if (sceneId && sceneById.value.has(sceneId)) {
      counts.set(sceneId, (counts.get(sceneId) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([sceneId, shotCount]) => ({
      scene: sceneById.value.get(sceneId)!,
      shotCount,
    }))
    .sort((left, right) => right.shotCount - left.shotCount || left.scene.name.localeCompare(right.scene.name));
});
const missingSceneReferences = computed(() => shots.value
  .map((shot) => {
    const sceneId = shot.sceneId?.trim();
    if (!sceneId) {
      return {
        shotId: shot.id,
        label: `镜头 ${shot.order} 未绑定场景`,
      };
    }
    if (!sceneById.value.has(sceneId)) {
      return {
        shotId: shot.id,
        label: `镜头 ${shot.order} 的场景「${sceneId}」不在本章结构场景卡中`,
      };
    }
    return null;
  })
  .filter((item): item is { shotId: string; label: string } => Boolean(item)));
const isPreflightConfirmed = computed(() => {
  const preflight = props.snapshot.imagePreflight;
  const storyboard = props.snapshot.storyboard;
  return Boolean(
    preflight
    && storyboard
    && preflight.chapterId === currentChapterId.value
    && preflight.preflightJson.ready
    && preflight.sourceStoryboardId === storyboard.id
    && preflight.sourceStoryboardUpdatedAt === storyboard.updatedAt,
  );
});

const checklist = computed(() => [
  {
    key: "storyboard",
    title: "正式分镜",
    status: hasFormalStoryboard.value ? "ok" : "warn",
    description: hasFormalStoryboard.value ? "当前章节已存在正式 storyboard.json。" : "需要先在分镜工作台确认分镜。",
  },
  {
    key: "binding",
    title: "角色绑定",
    status: unresolvedTokens.value.length === 0 ? "ok" : "warn",
    description: unresolvedTokens.value.length === 0
      ? "镜头中的角色已能匹配项目角色库或无需处理。"
      : `还有 ${unresolvedTokens.value.length} 个出镜名称未匹配项目角色库。`,
  },
  {
    key: "references",
    title: "角色锁定",
    status: missingRequiredReferences.value.length === 0 && runningReferenceTasks.value.length === 0 ? "ok" : "warn",
    description: missingRequiredReferences.value.length > 0
      ? `还有 ${missingRequiredReferences.value.length} 个本章出镜角色需要锁定形象。`
      : runningReferenceTasks.value.length > 0
        ? `还有 ${runningReferenceTasks.value.length} 个角色正在生成图。`
        : "本章需要稳定形象的角色已经锁定。",
  },
  {
    key: "scenes",
    title: "场景绑定",
    status: missingSceneReferences.value.length === 0 ? "ok" : "warn",
    description: missingSceneReferences.value.length === 0
      ? "镜头已绑定到本章剧情结构场景卡。"
      : `还有 ${missingSceneReferences.value.length} 个镜头缺少有效场景绑定。`,
  },
  {
    key: "style",
    title: "画风上下文",
    status: styleHasWarning.value ? "warn" : "ok",
    description: styleHasWarning.value
      ? "当前使用自定义画风，可继续确认；后续建议补充更明确的画风参考。"
      : `将按「${comicFormatLabel.value} / ${artStyleLabel.value}」生成候选图上下文。`,
  },
  {
    key: "confirmed",
    title: "确认记录",
    status: isPreflightConfirmed.value ? "ok" : "warn",
    description: isPreflightConfirmed.value
      ? "当前章节已写入 preflight.json，可进入候选图。"
      : "检查通过后需要确认一次，写入 preflight.json。",
  },
]);

const canPassChecks = computed(() =>
  hasFormalStoryboard.value
  && unresolvedTokens.value.length === 0
  && missingRequiredReferences.value.length === 0
  && runningReferenceTasks.value.length === 0
  && missingSceneReferences.value.length === 0
);
const canConfirmPreflight = computed(() => canPassChecks.value && !isPreflightConfirmed.value);
const canEnterCandidates = computed(() => canPassChecks.value && isPreflightConfirmed.value);
const nextAction = computed(() => {
  if (!hasFormalStoryboard.value) {
    return {
      action: "wait",
      tone: "waiting",
      title: "先确认本章分镜",
      description: "出图准备只读取正式分镜。待确认分镜不能进入候选图。",
      buttonLabel: "等待分镜确认",
      enabled: false,
    } as const;
  }

  if (unresolvedTokens.value.length > 0) {
    return {
      action: "issues",
      tone: "blocked",
      title: "确认出镜角色",
      description: "先把分镜里的角色名称确认清楚：加入本章角色、合并到已有角色、设为临时角色，或不参与出图。",
      buttonLabel: "处理出镜角色",
      enabled: true,
    } as const;
  }

  if (missingRequiredReferences.value.length > 0) {
    return {
      action: "characters",
      tone: "blocked",
      title: "锁定本章角色",
      description: "主角、常驻角色和本章重要角色需要锁定形象后，才能稳定生成候选图。",
      buttonLabel: "锁定本章角色",
      enabled: true,
    } as const;
  }

  if (runningReferenceTasks.value.length > 0) {
    return {
      action: "characters",
      tone: "waiting",
      title: "等待角色图生成",
      description: "角色图任务正在排队或生成中。完成后本章会继续检查是否可以出图。",
      buttonLabel: "查看生成进度",
      enabled: true,
    } as const;
  }

  if (missingSceneReferences.value.length > 0) {
    return {
      action: "scenes",
      tone: "blocked",
      title: "检查场景绑定",
      description: "还有镜头没有绑定到本章场景卡。候选图生成前，需要先让每个镜头有明确场景。",
      buttonLabel: "查看场景问题",
      enabled: true,
    } as const;
  }

  if (!isPreflightConfirmed.value) {
    return {
      action: "confirm",
      tone: "ready",
      title: "确认本章可出图",
      description: "角色、场景和画风上下文已经满足候选图生成要求。确认后会写入本章出图准备记录。",
      buttonLabel: "确认出图准备",
      enabled: canConfirmPreflight.value,
    } as const;
  }

  return {
    action: "candidates",
    tone: "done",
    title: "进入候选图工作台",
    description: "本章出图准备已经确认，可以开始为每个分镜生成和选择候选图。",
    buttonLabel: "进入候选图",
    enabled: canEnterCandidates.value,
  } as const;
});
const nextActionIcon = computed(() => {
  switch (nextAction.value.action) {
    case "characters":
      return UsersRound;
    case "confirm":
      return CheckCircle2;
    case "candidates":
      return ArrowRight;
    case "issues":
    case "scenes":
      return AlertCircle;
    case "wait":
      return Lock;
  }
});

function selectChapter(event: Event) {
  const chapterId = (event.target as HTMLSelectElement).value;
  if (chapterId) {
    emit("selectChapter", chapterId);
  }
}

function confirmPreflight() {
  if (currentChapterId.value && canConfirmPreflight.value) {
    emit("confirmPreflight", currentChapterId.value);
  }
}

function runNextAction() {
  switch (nextAction.value.action) {
    case "characters":
      emit("openCharacters");
      return;
    case "confirm":
      confirmPreflight();
      return;
    case "candidates":
      emit("goCandidates");
      return;
    case "issues":
      document.getElementById("preflight-role-issues")?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    case "scenes":
      document.getElementById("preflight-scene-issues")?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    case "wait":
      return;
  }
}

function resolveToken(token: string, action: ResolveImagePreflightCharacterAction) {
  if (!currentChapterId.value) {
    return;
  }
  const targetCharacterId = action === "merge_existing" ? selectedMergeTargets[token] : undefined;
  if (action === "merge_existing" && !targetCharacterId) {
    return;
  }
  emit("resolveCharacter", {
    chapterId: currentChapterId.value,
    input: {
      token,
      action,
      ...(targetCharacterId ? { targetCharacterId } : {}),
    },
  });
}

function getChapterPreflightLabel(chapter: ChapterListItem) {
  if (chapter.storyboardStatus === "storyboard_done" || chapter.status === "storyboard_done" || chapter.status === "images_done" || chapter.status === "layout_done" || chapter.status === "exported") {
    return "可检查";
  }
  if (chapter.storyboardStatus === "pending_confirmation") {
    return "待确认分镜";
  }
  return "需分镜";
}

function getShotCharacterTokens(shot: WorkbenchShot) {
  const tokens = shot.characterIds
    .map((item) => item.trim())
    .filter((item) => item && !/^(无|无人|旁白|环境|背景)$/i.test(item));
  return [...new Set(tokens)];
}

function getShotCharacterLabel(shot: WorkbenchShot) {
  const tokens = getShotCharacterTokens(shot);
  return tokens.length > 0 ? tokens.join("、") : "未填写出镜角色";
}

function normalizeToken(value: string) {
  return value.trim().toLowerCase();
}

function hasFinalReference(character: ProjectCharacter) {
  return Boolean(character.primaryReferenceAssetId && character.primaryReferenceKind === "final_reference");
}

function isRequiredReferenceCharacter(character: ProjectCharacter, appearanceCount: number) {
  return character.level === "lead"
    || character.level === "recurring"
    || (character.level === "chapter" && appearanceCount > 1);
}

function isReferenceTaskActive(character: ProjectCharacter) {
  return props.tasks.some((task) =>
    task.projectId === props.snapshot.project.id
    && task.type === "character_reference_generate"
    && task.target?.type === "character"
    && task.target.id === character.id
    && task.input.referenceKind === "final_reference"
    && (task.status === "queued" || task.status === "running" || task.status === "retrying"),
  );
}

function getCharacterDescription(character: ProjectCharacter) {
  return [character.role, character.appearance, character.personality]
    .map((item) => item.trim())
    .filter(Boolean)
    .join("，") || character.promptFragment || "暂无角色描述";
}

function getLevelLabel(level: ProjectCharacter["level"]) {
  const labels: Record<ProjectCharacter["level"], string> = {
    lead: "主角",
    recurring: "常驻角色",
    chapter: "本章重要",
    extra: "临时/背景",
  };
  return labels[level];
}

function getComicFormatLabel(format: WorkbenchSnapshot["project"]["comicFormat"]) {
  const labels: Record<WorkbenchSnapshot["project"]["comicFormat"], string> = {
    vertical_scroll: "竖版条漫",
    page_horizontal: "横版页漫",
    four_panel: "四格漫画",
  };
  return labels[format];
}

function getArtStyleLabel(style: WorkbenchSnapshot["project"]["artStyle"]) {
  const labels: Record<WorkbenchSnapshot["project"]["artStyle"], string> = {
    dark_realistic: "暗黑写实漫画",
    semi_realistic: "半写实漫画",
    japanese_realistic: "日系写实漫画",
    comic_style: "漫画风格",
    cyberpunk: "赛博朋克漫画",
    custom: "自定义画风",
  };
  return labels[style];
}
</script>

<style scoped>
.image-preflight-workspace {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  gap: 14px;
  overflow: hidden;
}

.preflight-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  border: 1px solid rgba(148, 163, 184, 0.16);
  border-radius: 8px;
  background: rgba(15, 23, 42, 0.64);
  padding: 12px 14px;
}

.chapter-picker {
  display: flex;
  align-items: center;
  min-width: 0;
  gap: 10px;
}

.chapter-picker svg {
  color: #a78bfa;
  flex: 0 0 auto;
}

.chapter-picker select {
  min-width: 240px;
  max-width: 420px;
  height: 36px;
  border: 1px solid rgba(116, 95, 255, 0.24);
  border-radius: 8px;
  background: rgba(8, 13, 26, 0.92);
  color: #f8fbff;
  padding: 0 12px;
  font-size: 13px;
  font-weight: 800;
}

.story-title {
  min-width: 0;
  max-width: 260px;
  color: #8df0dc;
  font-size: 12px;
  font-weight: 900;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.preflight-actions {
  display: flex;
  flex: 0 0 auto;
  gap: 8px;
}

.primary-action,
.secondary-action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 36px;
  border-radius: 8px;
  padding: 0 12px;
  font-size: 13px;
  font-weight: 900;
}

.primary-action {
  border: 1px solid rgba(34, 199, 169, 0.34);
  background: linear-gradient(135deg, #22c7a9, #745fff);
  color: #ffffff;
}

.primary-action:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}

.secondary-action {
  border: 1px solid rgba(148, 163, 184, 0.18);
  background: rgba(15, 23, 42, 0.72);
  color: #dbe7ff;
}

.preflight-empty {
  display: grid;
  place-items: center;
  gap: 8px;
  min-height: 360px;
  border: 1px solid rgba(148, 163, 184, 0.16);
  border-radius: 8px;
  background: rgba(15, 23, 42, 0.62);
  color: #95a3c2;
  text-align: center;
}

.preflight-empty svg {
  color: #a78bfa;
}

.preflight-empty h2,
.preflight-empty p {
  margin: 0;
}

.preflight-empty h2 {
  color: #f8fbff;
  font-size: 18px;
}

.preflight-empty p {
  max-width: 480px;
  font-size: 13px;
  line-height: 1.7;
}

.preflight-scroll {
  display: grid;
  min-height: 0;
  overflow: auto;
  gap: 12px;
  padding-right: 4px;
}

.preflight-hero,
.preflight-next-card,
.preflight-metrics,
.checklist-panel,
.issue-panel,
.role-reference-panel,
.scene-style-panel,
.shot-bind-panel {
  border: 1px solid rgba(148, 163, 184, 0.16);
  border-radius: 8px;
  background: rgba(15, 23, 42, 0.62);
}

.preflight-hero {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 16px;
}

.preflight-hero.is-ready {
  border-color: rgba(34, 199, 169, 0.26);
  background: rgba(11, 42, 38, 0.4);
}

.preflight-hero span,
.preflight-metrics span,
.panel-heading h3,
.character-check-card span,
.shot-bind-row span {
  color: #8df0dc;
  font-size: 12px;
  font-weight: 900;
}

.preflight-hero h2,
.panel-heading h3,
.character-check-card h4 {
  margin: 0;
  color: #f8fbff;
}

.preflight-hero h2 {
  margin-top: 4px;
  font-size: 20px;
}

.preflight-hero p {
  max-width: 520px;
  margin: 0;
  color: #95a3c2;
  font-size: 13px;
  line-height: 1.7;
}

.preflight-next-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  padding: 14px 16px;
}

.preflight-next-card.is-blocked {
  border-color: rgba(245, 158, 11, 0.3);
  background: rgba(59, 35, 7, 0.28);
}

.preflight-next-card.is-waiting {
  border-color: rgba(116, 95, 255, 0.26);
  background: rgba(35, 27, 80, 0.28);
}

.preflight-next-card.is-ready,
.preflight-next-card.is-done {
  border-color: rgba(34, 199, 169, 0.28);
  background: rgba(11, 42, 38, 0.36);
}

.preflight-next-card div {
  display: grid;
  min-width: 0;
  gap: 4px;
}

.preflight-next-card span:first-child {
  color: #8df0dc;
  font-size: 12px;
  font-weight: 900;
}

.preflight-next-card h3 {
  margin: 0;
  color: #f8fbff;
  font-size: 18px;
}

.preflight-next-card p {
  margin: 0;
  color: #cbd5e1;
  font-size: 13px;
  line-height: 1.6;
}

.preflight-next-card button {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 38px;
  border: 1px solid rgba(34, 199, 169, 0.34);
  border-radius: 8px;
  background: linear-gradient(135deg, #22c7a9, #745fff);
  color: #ffffff;
  padding: 0 13px;
  font-size: 13px;
  font-weight: 900;
}

.preflight-next-card button:disabled {
  cursor: not-allowed;
  opacity: 0.48;
}

.preflight-metrics {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  overflow: hidden;
}

.preflight-metrics div {
  display: grid;
  gap: 4px;
  padding: 12px 14px;
  background: rgba(255, 255, 255, 0.025);
}

.preflight-metrics strong {
  color: #f8fbff;
  font-size: 20px;
}

.checklist-panel {
  display: grid;
  gap: 1px;
  overflow: hidden;
}

.check-item {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 10px;
  padding: 12px 14px;
  background: rgba(255, 255, 255, 0.025);
}

.check-item.is-ok svg {
  color: #22c7a9;
}

.check-item.is-warn svg {
  color: #f59e0b;
}

.check-item strong {
  display: block;
  color: #f8fbff;
  font-size: 14px;
}

.check-item p {
  margin: 4px 0 0;
  color: #95a3c2;
  font-size: 13px;
  line-height: 1.6;
}

.issue-panel,
.role-reference-panel,
.scene-style-panel,
.shot-bind-panel {
  display: grid;
  gap: 12px;
  padding: 14px;
}

.panel-heading {
  display: flex;
  align-items: center;
  gap: 8px;
}

.panel-heading svg {
  color: #a78bfa;
}

.token-action-list {
  display: grid;
  gap: 8px;
}

.token-action-card {
  display: grid;
  grid-template-columns: minmax(130px, 1fr) auto;
  gap: 10px;
  align-items: center;
  border: 1px solid rgba(245, 158, 11, 0.22);
  border-radius: 8px;
  background: rgba(245, 158, 11, 0.07);
  padding: 10px;
}

.token-action-card > div:first-child {
  display: grid;
  gap: 3px;
  min-width: 0;
}

.token-action-card span {
  color: #fbbf24;
  font-size: 12px;
  font-weight: 900;
}

.token-action-card strong {
  color: #f8fbff;
  font-size: 15px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.token-actions,
.merge-row {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
}

.merge-row {
  grid-column: 1 / -1;
}

.merge-row select {
  min-width: 220px;
  height: 32px;
  border: 1px solid rgba(148, 163, 184, 0.18);
  border-radius: 8px;
  background: rgba(8, 13, 26, 0.92);
  color: #f8fbff;
  padding: 0 10px;
  font-size: 12px;
  font-weight: 800;
}

.mini-action {
  min-height: 32px;
  border: 1px solid rgba(148, 163, 184, 0.18);
  border-radius: 8px;
  background: rgba(15, 23, 42, 0.76);
  color: #dbe7ff;
  padding: 0 10px;
  font-size: 12px;
  font-weight: 900;
}

.mini-action.is-danger {
  border-color: rgba(248, 113, 113, 0.28);
  color: #fecaca;
}

.mini-action:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}

.reference-empty {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #95a3c2;
  font-size: 13px;
  font-weight: 800;
}

.character-check-list {
  display: grid;
  gap: 8px;
}

.panel-action-note {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  border: 1px solid rgba(245, 158, 11, 0.22);
  border-radius: 8px;
  background: rgba(245, 158, 11, 0.08);
  padding: 12px;
}

.panel-action-note div {
  display: grid;
  min-width: 0;
  gap: 4px;
}

.panel-action-note strong {
  color: #fef3c7;
  font-size: 14px;
}

.panel-action-note span {
  color: #fbbf24;
  font-size: 13px;
  line-height: 1.5;
}

.character-check-card {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 12px;
  align-items: start;
  border: 1px solid rgba(148, 163, 184, 0.12);
  border-radius: 8px;
  background: rgba(8, 13, 26, 0.56);
  padding: 12px;
}

.character-check-card h4 {
  margin-top: 4px;
  font-size: 16px;
}

.character-check-card p {
  margin: 6px 0 0;
  color: #95a3c2;
  font-size: 13px;
  line-height: 1.6;
}

.reference-state {
  border-radius: 999px;
  padding: 6px 10px;
  font-size: 12px;
  white-space: nowrap;
}

.reference-state.is-ready {
  background: rgba(34, 199, 169, 0.12);
  color: #8df0dc;
}

.reference-state.is-running {
  background: rgba(116, 95, 255, 0.14);
  color: #c4b5fd;
}

.reference-state.is-missing {
  background: rgba(245, 158, 11, 0.12);
  color: #fbbf24;
}

.reference-state.is-optional {
  background: rgba(148, 163, 184, 0.12);
  color: #cbd5e1;
}

.scene-style-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.scene-style-grid article,
.scene-check-list article,
.scene-warning-list article {
  border: 1px solid rgba(148, 163, 184, 0.12);
  border-radius: 8px;
  background: rgba(8, 13, 26, 0.56);
  padding: 10px 12px;
}

.scene-style-grid article {
  display: grid;
  gap: 4px;
}

.scene-style-grid span,
.scene-check-list span,
.scene-warning-list span {
  color: #95a3c2;
  font-size: 12px;
  font-weight: 800;
}

.scene-style-grid strong,
.scene-check-list strong {
  color: #f8fbff;
  font-size: 13px;
}

.scene-check-list,
.scene-warning-list {
  display: grid;
  gap: 8px;
}

.scene-check-list article,
.scene-warning-list article {
  display: flex;
  align-items: center;
  gap: 8px;
}

.scene-check-list svg {
  color: #22c7a9;
}

.scene-warning-list svg {
  color: #f59e0b;
  flex: 0 0 auto;
}

.scene-check-list div {
  display: grid;
  min-width: 0;
  gap: 2px;
}

.shot-bind-list {
  display: grid;
  gap: 8px;
}

.shot-bind-row {
  display: grid;
  grid-template-columns: 72px minmax(0, 1fr) minmax(140px, 220px);
  gap: 10px;
  align-items: center;
  border: 1px solid rgba(148, 163, 184, 0.12);
  border-radius: 8px;
  background: rgba(8, 13, 26, 0.56);
  padding: 10px 12px;
}

.shot-bind-row strong {
  color: #f8fbff;
  font-size: 13px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.shot-bind-row small {
  color: #95a3c2;
  font-size: 12px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

@media (max-width: 980px) {
  .preflight-toolbar,
  .preflight-hero,
  .preflight-next-card,
  .panel-action-note {
    align-items: stretch;
    flex-direction: column;
  }

  .preflight-metrics {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .shot-bind-row {
    grid-template-columns: 1fr;
  }

  .scene-style-grid {
    grid-template-columns: 1fr;
  }

  .token-action-card {
    grid-template-columns: 1fr;
  }

  .token-actions,
  .merge-row {
    justify-content: flex-start;
    flex-wrap: wrap;
  }

  .merge-row select {
    min-width: 180px;
  }
}
</style>
