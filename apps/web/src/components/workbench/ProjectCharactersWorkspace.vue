<template>
  <section class="characters-workspace" aria-label="项目角色库">
    <header class="characters-header">
      <div>
        <span>项目角色库</span>
        <h2>{{ activeView === "context" ? "本章相关角色图" : "角色列表与角色图" }}</h2>
      </div>
      <button class="primary-action" type="button" :disabled="loading" @click="$emit('extractCharacters')">
        <UsersRound :size="15" />
        <span>{{ characters.length > 0 ? "重新整理角色列表" : "提取项目角色" }}</span>
      </button>
    </header>

    <div class="characters-status">
      <div>
        <span>需定稿角色</span>
        <strong>{{ finalizedRequiredCount }}/{{ requiredCount }}</strong>
      </div>
      <div>
        <span>角色总数</span>
        <strong>{{ characters.length }}</strong>
      </div>
      <div>
        <span>角色库状态</span>
        <strong>{{ ready ? "已就绪" : "待确认" }}</strong>
      </div>
    </div>

    <div v-if="characters.length > 0" class="characters-view-switch" role="tablist" aria-label="角色展示范围">
      <button
        type="button"
        role="tab"
        :aria-selected="activeView === 'context'"
        :class="{ 'is-active': activeView === 'context' }"
        @click="activeView = 'context'"
      >
        <span>当前相关</span>
        <strong>{{ contextCharacters.length }}</strong>
      </button>
      <button
        type="button"
        role="tab"
        :aria-selected="activeView === 'all'"
        :class="{ 'is-active': activeView === 'all' }"
        @click="activeView = 'all'"
      >
        <span>全部角色</span>
        <strong>{{ characters.length }}</strong>
      </button>
    </div>

    <section v-if="activeView === 'context' && unresolvedCharacterNames.length > 0" class="character-context-alert">
      <AlertCircle :size="16" />
      <div>
        <strong>当前章节还有未纳入角色库的出镜角色</strong>
        <span>{{ unresolvedCharacterNames.join("、") }}</span>
      </div>
    </section>

    <div v-if="characters.length === 0" class="empty-state">
      <UserRound :size="24" />
      <h3>还没有项目角色</h3>
      <p>先从剧本大纲或当前章节里提取角色，系统会自动为角色生成效果图。</p>
    </div>

    <div v-else class="characters-scroll">
      <section class="character-summary">
        <div class="section-title">
          <UsersRound :size="16" />
          <h3>角色描述</h3>
        </div>
        <ul>
          <li v-for="character in displayedCharacters" :key="`summary-${character.id}`">
            <strong>{{ character.name }}：</strong>
            <span>{{ getCharacterDescription(character) }}</span>
          </li>
        </ul>
      </section>

      <CharacterImageList
        :characters="displayedCharacters"
        :loading="loading"
        :snapshot="snapshot"
        :tasks="tasks"
        subtitle="角色图"
        title="图片列表"
        empty-title="当前没有相关角色"
        empty-text="确认剧情结构后会显示本章涉及的角色。"
        @regenerate-reference="$emit('regenerateReference', $event)"
        @delete-reference="$emit('deleteReference', $event)"
        @confirm-preview="$emit('confirmPreview', $event)"
        @confirm-reference="$emit('confirmReference', $event)"
      />
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { AlertCircle, UserRound, UsersRound } from "lucide-vue-next";
import type {
  GenerationTaskItem,
  ProjectCharacter,
  UpdateProjectCharacterRequest,
  WorkbenchSnapshot,
} from "@airoaming/shared";
import CharacterImageList from "./CharacterImageList.vue";

const props = defineProps<{
  snapshot: WorkbenchSnapshot;
  tasks: GenerationTaskItem[];
  loading: boolean;
  initialView?: "context" | "all";
}>();

const emit = defineEmits<{
  extractCharacters: [];
  ensurePreviews: [];
  regenerateReference: [payload: { characterId: string; referenceKind: "preview_front" | "final_reference"; input: UpdateProjectCharacterRequest }];
  deleteReference: [payload: { characterId: string; assetId: string }];
  confirmPreview: [payload: { characterId: string; assetId: string }];
  confirmReference: [payload: { characterId: string; assetId: string }];
}>();

const ensuredSignature = ref("");
const activeView = ref<"context" | "all">(props.initialView ?? "all");

const characters = computed(() => props.snapshot.characters ?? []);
const requiredCharacters = computed(() => characters.value.filter((character) => character.level === "lead" || character.level === "recurring"));
const requiredCount = computed(() => requiredCharacters.value.length);
const finalizedRequiredCount = computed(() => requiredCharacters.value.filter((character) =>
  (character.status === "finalized" || character.status === "in_use")
  && Boolean(character.primaryReferenceAssetId)
  && character.primaryReferenceKind === "final_reference",
).length);
const ready = computed(() => requiredCount.value > 0 && finalizedRequiredCount.value === requiredCount.value);
const currentChapterId = computed(() =>
  props.snapshot.currentChapter?.id
  ?? props.snapshot.story.chapterId
  ?? props.snapshot.storyStructure?.chapterId
  ?? props.snapshot.storyboard?.chapterId
  ?? null,
);
const characterById = computed(() => new Map(characters.value.map((character) => [character.id, character])));
const characterByName = computed(() => new Map(characters.value.map((character) => [normalizeCharacterKey(character.name), character])));
const currentCharacterTokens = computed(() => {
  const tokens: string[] = [];
  const chapterId = currentChapterId.value;
  const addToken = (value: string | null | undefined) => {
    const normalized = value?.trim();
    if (normalized) {
      tokens.push(normalized);
    }
  };

  props.snapshot.shots
    .filter((shot) => !chapterId || !shot.chapterId || shot.chapterId === chapterId)
    .forEach((shot) => {
      shot.characterIds.forEach(addToken);
      shot.characters.forEach(addToken);
    });

  const structure = props.snapshot.storyStructure?.structureJson;
  if (structure && (!chapterId || structure.chapterId === chapterId)) {
    structure.characters.forEach((character) => addToken(character.name));
    structure.beats.forEach((beat) => beat.characters.forEach(addToken));
  }

  return [...new Set(tokens)];
});
const contextCharacters = computed(() => {
  const matched = new Map<string, ProjectCharacter>();
  currentCharacterTokens.value.forEach((token) => {
    const character = characterById.value.get(token) ?? characterByName.value.get(normalizeCharacterKey(token));
    if (character) {
      matched.set(character.id, character);
    }
  });

  if (matched.size > 0) {
    return [...matched.values()];
  }
  if (requiredCharacters.value.length > 0) {
    return requiredCharacters.value;
  }
  return characters.value;
});
const displayedCharacters = computed(() => activeView.value === "context" ? contextCharacters.value : characters.value);
const unresolvedCharacterNames = computed(() => currentCharacterTokens.value.filter((token) =>
  !characterById.value.has(token)
  && !characterByName.value.has(normalizeCharacterKey(token))
  && !looksLikeInternalId(token),
));

watch(
  () => props.initialView,
  (initialView) => {
    activeView.value = initialView ?? "all";
  },
  { immediate: true },
);

watch(
  () => characters.value.map((character) => `${character.id}:${character.referenceAssetIds.join(",")}`).join("|"),
  (signature) => {
    if (!signature || signature === ensuredSignature.value) {
      return;
    }
    ensuredSignature.value = signature;
    emit("ensurePreviews");
  },
  { immediate: true },
);

function normalizeCharacterKey(value: string) {
  return value.trim().toLowerCase();
}

function looksLikeInternalId(value: string) {
  return /^[a-z]+_[a-z0-9_-]+$/i.test(value) || /^[0-9a-f-]{16,}$/i.test(value);
}

function getCharacterDescription(character: ProjectCharacter) {
  const description = [character.role, character.appearance, character.personality]
    .map((item) => item.trim())
    .filter(Boolean)
    .join("，");
  return description || character.promptFragment || "暂无角色描述";
}
</script>

<style scoped>
.characters-workspace {
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
  gap: 12px;
}

.characters-header,
.characters-status,
.characters-view-switch,
.character-context-alert,
.character-summary,
.empty-state {
  border: 1px solid rgba(148, 163, 184, 0.16);
  border-radius: 8px;
  background: rgba(15, 23, 42, 0.62);
}

.characters-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 16px;
}

.characters-header span,
.characters-status span {
  color: #8df0dc;
  font-size: 12px;
  font-weight: 900;
}

.characters-header h2,
.empty-state h3,
.character-summary h3 {
  margin: 0;
  color: #f8fbff;
}

.characters-header h2 {
  margin-top: 4px;
  font-size: 18px;
}

.characters-status {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 1px;
  overflow: hidden;
}

.characters-status div {
  display: grid;
  gap: 4px;
  padding: 12px 14px;
  background: rgba(255, 255, 255, 0.025);
}

.characters-status strong {
  color: #f8fbff;
  font-size: 18px;
}

.characters-view-switch {
  display: flex;
  gap: 8px;
  padding: 6px;
}

.characters-view-switch button {
  display: inline-flex;
  flex: 1 1 0;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-height: 38px;
  border: 1px solid transparent;
  border-radius: 8px;
  background: transparent;
  color: #94a3b8;
  padding: 0 12px;
  font-weight: 900;
}

.characters-view-switch button.is-active {
  border-color: rgba(139, 92, 246, 0.26);
  background: rgba(139, 92, 246, 0.12);
  color: #f8fbff;
}

.character-context-alert {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  border-color: rgba(251, 191, 36, 0.24);
  background: rgba(69, 45, 9, 0.28);
  color: #fde68a;
  padding: 12px 14px;
}

.character-context-alert div {
  display: grid;
  gap: 4px;
}

.character-context-alert span {
  color: #fcd34d;
  font-size: 12px;
}

.characters-scroll {
  display: flex;
  flex-direction: column;
  gap: 14px;
  min-height: 0;
  overflow: auto;
  padding-right: 6px;
}

.character-summary {
  display: grid;
  gap: 10px;
  padding: 14px;
}

.section-title {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #8df0dc;
}

.character-summary ul {
  display: grid;
  gap: 8px;
  margin: 0;
  padding-left: 18px;
  color: #cbd5e1;
  line-height: 1.75;
}

.character-summary strong {
  color: #f8fbff;
}

.empty-state {
  display: grid;
  flex: 1 1 auto;
  place-items: center;
  min-height: 260px;
  color: #94a3b8;
  text-align: center;
  padding: 24px;
}

.empty-state p {
  margin: 0;
}

.primary-action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 36px;
  border: 1px solid rgba(34, 199, 169, 0.28);
  border-radius: 8px;
  background: rgba(34, 199, 169, 0.1);
  color: #8df0dc;
  padding: 0 12px;
  font-size: 12px;
  font-weight: 900;
}

button:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}
</style>
