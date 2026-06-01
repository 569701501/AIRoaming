<template>
  <section class="characters-workspace" aria-label="项目角色库">
    <header class="characters-header">
      <div>
        <span>项目角色库</span>
        <h2>{{ ready ? "角色定稿已就绪" : "确认主角与常驻角色" }}</h2>
      </div>
      <button class="primary-action" type="button" :disabled="loading" @click="$emit('extractCharacters')">
        <UsersRound :size="15" />
        <span>{{ characters.length > 0 ? "重新提取角色" : "提取项目角色" }}</span>
      </button>
    </header>

    <div class="characters-status">
      <div>
        <span>必需角色</span>
        <strong>{{ finalizedRequiredCount }}/{{ requiredCount }}</strong>
      </div>
      <div>
        <span>角色总数</span>
        <strong>{{ characters.length }}</strong>
      </div>
      <div>
        <span>当前门槛</span>
        <strong>{{ ready ? "已通过" : "待四视图确认" }}</strong>
      </div>
    </div>

    <div v-if="characters.length === 0" class="empty-state">
      <UserRound :size="24" />
      <h3>还没有项目角色</h3>
      <p>先从已确认剧本大纲或当前章节里提取角色，再为主角和常驻角色生成四视图定稿。</p>
    </div>

    <div v-else class="character-list">
      <article v-for="character in characters" :key="character.id" class="character-card">
        <div class="character-title-row">
          <div>
            <span>{{ getLevelLabel(character.level) }}</span>
            <h3>{{ character.name }}</h3>
          </div>
          <span class="status-pill" :class="`is-${character.status}`">{{ getStatusLabel(character.status) }}</span>
        </div>

        <div class="character-edit-grid">
          <label>
            <span>角色名</span>
            <input v-model.trim="forms[character.id].name" :disabled="isLocked(character)" />
          </label>
          <label>
            <span>层级</span>
            <select v-model="forms[character.id].level" :disabled="isLocked(character)">
              <option value="lead">主角</option>
              <option value="recurring">常驻角色</option>
              <option value="chapter">本章重要</option>
              <option value="extra">临时/背景</option>
            </select>
          </label>
          <label>
            <span>职能</span>
            <input v-model.trim="forms[character.id].role" :disabled="isLocked(character)" />
          </label>
          <label class="is-wide">
            <span>外貌设定</span>
            <textarea v-model.trim="forms[character.id].appearance" rows="3" :disabled="isLocked(character)"></textarea>
          </label>
          <label class="is-wide">
            <span>性格气质</span>
            <textarea v-model.trim="forms[character.id].personality" rows="2" :disabled="isLocked(character)"></textarea>
          </label>
          <label class="is-wide">
            <span>出图提示片段</span>
            <textarea v-model.trim="forms[character.id].promptFragment" rows="2" :disabled="isLocked(character)"></textarea>
          </label>
        </div>

        <div class="character-actions">
          <button class="secondary-action" type="button" :disabled="loading || isLocked(character)" @click="saveCharacter(character)">
            <Save :size="14" />
            <span>保存设定</span>
          </button>
          <button
            v-if="character.primaryReferenceKind !== 'none'"
            class="primary-action"
            type="button"
            :disabled="loading || isLocked(character)"
            @click="$emit('generateReference', { characterId: character.id, referenceKind: character.primaryReferenceKind })"
          >
            <ImagePlus :size="14" />
            <span>{{ character.primaryReferenceKind === "turnaround_4view" ? "生成四视图" : "生成参考图" }}</span>
          </button>
        </div>

        <div v-if="getReferenceAssets(character).length > 0" class="reference-strip">
          <figure v-for="asset in getReferenceAssets(character)" :key="asset.id" class="reference-item">
            <img :src="assetUrl(asset.id)" :alt="asset.name" />
            <figcaption>
              <span>{{ asset.name }}</span>
              <button
                type="button"
                :disabled="loading || character.primaryReferenceAssetId === asset.id"
                @click="$emit('confirmReference', { characterId: character.id, assetId: asset.id })"
              >
                <CheckCircle2 :size="13" />
                <span>{{ character.primaryReferenceAssetId === asset.id ? "已定稿" : "确认定稿" }}</span>
              </button>
            </figcaption>
          </figure>
        </div>
      </article>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, reactive, watch } from "vue";
import { CheckCircle2, ImagePlus, Save, UserRound, UsersRound } from "lucide-vue-next";
import type {
  GenerateCharacterReferenceRequest,
  ProjectCharacter,
  ProjectCharacterLevel,
  UpdateProjectCharacterRequest,
  WorkbenchAsset,
  WorkbenchSnapshot,
} from "@airoaming/shared";
import { api } from "../../services/api";

const props = defineProps<{
  snapshot: WorkbenchSnapshot;
  loading: boolean;
}>();

const emit = defineEmits<{
  extractCharacters: [];
  updateCharacter: [payload: { characterId: string; input: UpdateProjectCharacterRequest }];
  generateReference: [payload: { characterId: string; referenceKind: GenerateCharacterReferenceRequest["referenceKind"] }];
  confirmReference: [payload: { characterId: string; assetId: string }];
}>();

type CharacterForm = Required<Pick<UpdateProjectCharacterRequest, "name" | "role" | "level" | "appearance" | "personality" | "promptFragment">>;

const forms = reactive<Record<string, CharacterForm>>({});
const characters = computed(() => props.snapshot.characters ?? []);
const assets = computed(() => props.snapshot.assets ?? []);
const requiredCharacters = computed(() => characters.value.filter((character) => character.level === "lead" || character.level === "recurring"));
const requiredCount = computed(() => requiredCharacters.value.length);
const finalizedRequiredCount = computed(() => requiredCharacters.value.filter((character) =>
  (character.status === "finalized" || character.status === "in_use")
  && character.primaryReferenceAssetId
  && character.primaryReferenceKind === "turnaround_4view",
).length);
const ready = computed(() => requiredCount.value > 0 && finalizedRequiredCount.value === requiredCount.value);

watch(
  characters,
  (items) => {
    for (const character of items) {
      forms[character.id] = {
        name: character.name,
        role: character.role,
        level: character.level,
        appearance: character.appearance,
        personality: character.personality,
        promptFragment: character.promptFragment,
      };
    }
  },
  { immediate: true },
);

function saveCharacter(character: ProjectCharacter) {
  emit("updateCharacter", {
    characterId: character.id,
    input: forms[character.id],
  });
}

function getReferenceAssets(character: ProjectCharacter): WorkbenchAsset[] {
  const ids = new Set(character.referenceAssetIds);
  return assets.value.filter((asset) => ids.has(asset.id));
}

function assetUrl(assetId: string) {
  return api.projectAssetFileUrl(props.snapshot.project.id, assetId);
}

function isLocked(character: ProjectCharacter) {
  return character.status === "in_use";
}

function getLevelLabel(level: ProjectCharacterLevel) {
  const labels: Record<ProjectCharacterLevel, string> = {
    lead: "主角",
    recurring: "常驻角色",
    chapter: "本章重要",
    extra: "临时/背景",
  };
  return labels[level];
}

function getStatusLabel(status: ProjectCharacter["status"]) {
  const labels: Record<ProjectCharacter["status"], string> = {
    draft: "草稿",
    needs_reference: "待定稿",
    finalized: "已定稿",
    in_use: "已使用",
  };
  return labels[status];
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
.character-card,
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
.characters-status span,
.character-title-row span,
.character-edit-grid label > span {
  color: #8df0dc;
  font-size: 12px;
  font-weight: 900;
}

.characters-header h2,
.empty-state h3,
.character-title-row h3 {
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

.empty-state {
  display: grid;
  place-items: center;
  gap: 8px;
  min-height: 320px;
  padding: 24px;
  color: #95a3c2;
  text-align: center;
}

.empty-state svg {
  color: #a78bfa;
}

.empty-state p {
  max-width: 480px;
  margin: 0;
  font-size: 13px;
  line-height: 1.7;
}

.character-list {
  display: grid;
  min-height: 0;
  gap: 12px;
  overflow-y: auto;
  padding-right: 4px;
}

.character-card {
  display: grid;
  gap: 12px;
  padding: 14px;
}

.character-title-row,
.character-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.character-title-row h3 {
  margin-top: 3px;
  font-size: 17px;
}

.status-pill {
  border: 1px solid rgba(148, 163, 184, 0.18);
  border-radius: 999px;
  background: rgba(148, 163, 184, 0.1);
  color: #cbd5e1;
  padding: 4px 9px;
  font-size: 12px;
  font-weight: 900;
}

.status-pill.is-finalized,
.status-pill.is-in_use {
  border-color: rgba(52, 211, 153, 0.28);
  background: rgba(52, 211, 153, 0.1);
  color: #8df0dc;
}

.status-pill.is-needs_reference {
  border-color: rgba(245, 158, 11, 0.3);
  background: rgba(245, 158, 11, 0.1);
  color: #facc15;
}

.character-edit-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
}

.character-edit-grid label {
  display: grid;
  gap: 6px;
  min-width: 0;
}

.character-edit-grid .is-wide {
  grid-column: 1 / -1;
}

.character-edit-grid input,
.character-edit-grid select,
.character-edit-grid textarea {
  width: 100%;
  border: 1px solid rgba(148, 163, 184, 0.16);
  border-radius: 8px;
  background: rgba(7, 12, 24, 0.72);
  color: #f8fbff;
  padding: 9px 10px;
  font: inherit;
  font-size: 13px;
}

.character-edit-grid textarea {
  resize: vertical;
  line-height: 1.55;
}

.character-actions {
  justify-content: flex-end;
}

.primary-action,
.secondary-action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  min-height: 34px;
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

.secondary-action {
  border: 1px solid rgba(148, 163, 184, 0.2);
  background: rgba(15, 23, 42, 0.72);
  color: #d8e0f0;
}

.primary-action:disabled,
.secondary-action:disabled,
.reference-item button:disabled {
  cursor: not-allowed;
  opacity: 0.56;
}

.reference-strip {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 10px;
}

.reference-item {
  display: grid;
  gap: 8px;
  margin: 0;
  overflow: hidden;
}

.reference-item img {
  width: 100%;
  aspect-ratio: 16 / 9;
  border: 1px solid rgba(148, 163, 184, 0.16);
  border-radius: 8px;
  background: rgba(7, 12, 24, 0.72);
  object-fit: contain;
}

.reference-item figcaption {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  color: #cbd5e1;
  font-size: 12px;
}

.reference-item figcaption > span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.reference-item button {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  min-height: 30px;
  border: 1px solid rgba(34, 199, 169, 0.24);
  border-radius: 8px;
  background: rgba(34, 199, 169, 0.1);
  color: #8df0dc;
  padding: 0 9px;
  font-size: 12px;
  font-weight: 900;
}

@media (max-width: 900px) {
  .characters-status,
  .character-edit-grid {
    grid-template-columns: 1fr;
  }

  .characters-header,
  .character-title-row,
  .character-actions {
    align-items: stretch;
    flex-direction: column;
  }
}
</style>
