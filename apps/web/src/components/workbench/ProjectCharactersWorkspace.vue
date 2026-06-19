<template>
  <section class="characters-workspace" aria-label="项目角色库">
    <!-- 可操作模式下保留头部操作按钮(内嵌视图用) -->
    <header v-if="!readonly" class="characters-header">
      <div>
        <span>项目角色库</span>
        <h2>角色列表与角色图</h2>
      </div>
      <button class="primary-action" type="button" :disabled="loading" @click="$emit('extractCharacters')">
        <UsersRound :size="15" />
        <span>{{ characters.length > 0 ? "重新整理角色列表" : "提取项目角色" }}</span>
      </button>
    </header>

    <div class="characters-scroll">
      <div v-if="characters.length === 0" class="empty-state">
        <UserRound :size="24" />
        <h3>还没有项目角色</h3>
        <p>{{ readonly ? "当前项目还没有任何角色。" : "先从剧本大纲或当前章节里提取角色。" }}</p>
      </div>

      <!-- 列表行布局:每个角色一整行 -->
      <ul v-else class="character-rows">
        <li v-for="character in characters" :key="character.id" class="character-row">
          <!-- 左侧:名字 + 层级 + 人物介绍 -->
          <div class="row-info">
            <div class="row-title">
              <strong>{{ character.name }}</strong>
              <span class="row-level">{{ getLevelLabel(character.level) }}</span>
            </div>
            <p class="row-desc">{{ getCharacterDescription(character) }}</p>
          </div>

          <!-- 右侧:角色图 + 三向图 并排 -->
          <div class="row-images">
            <div class="row-image-slot">
              <button
                v-if="getReferenceAsset(character, 'preview_front')"
                class="row-image-frame is-clickable"
                type="button"
                @click="openPreview(getReferenceAsset(character, 'preview_front')!, `${character.name} 角色图`)"
              >
                <img :src="assetUrl(getReferenceAsset(character, 'preview_front')!.id)" :alt="`${character.name} 角色图`" />
              </button>
              <div v-else class="row-image-frame">
                <div class="row-image-empty">
                  <ImageOff :size="18" />
                  <span>未生成</span>
                </div>
              </div>
              <span class="row-image-label">角色图</span>
            </div>

            <div class="row-image-slot">
              <button
                v-if="getReferenceAsset(character, 'final_reference')"
                class="row-image-frame is-clickable"
                type="button"
                @click="openPreview(getReferenceAsset(character, 'final_reference')!, `${character.name} 三向图`)"
              >
                <img :src="assetUrl(getReferenceAsset(character, 'final_reference')!.id)" :alt="`${character.name} 三向图`" />
              </button>
              <div v-else class="row-image-frame">
                <div class="row-image-empty">
                  <ImageOff :size="18" />
                  <span>未生成</span>
                </div>
              </div>
              <span class="row-image-label">三向图</span>
            </div>
          </div>
        </li>
      </ul>
    </div>

    <!-- 图片预览大图弹窗 -->
    <Teleport to="body">
      <div v-if="activePreview" class="preview-backdrop" role="dialog" aria-modal="true" @click.self="closePreview">
        <button class="preview-close" type="button" aria-label="关闭" @click="closePreview">
          <X :size="20" />
        </button>
        <img :src="assetUrl(activePreview.asset.id)" :alt="activePreview.alt" class="preview-image" />
        <span class="preview-caption">{{ activePreview.alt }}</span>
      </div>
    </Teleport>
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { ImageOff, UserRound, UsersRound, X } from "lucide-vue-next";
import type {
  GenerationTaskItem,
  ProjectCharacter,
  ProjectCharacterLevel,
  UpdateProjectCharacterRequest,
  WorkbenchAsset,
  WorkbenchSnapshot,
} from "@airoaming/shared";
import { api } from "../../services/api";

const props = defineProps<{
  snapshot: WorkbenchSnapshot;
  tasks: GenerationTaskItem[];
  loading: boolean;
  initialView?: "context" | "all";
  /** 只读模式:纯展示,隐藏所有操作按钮(右上角角色库弹窗用) */
  readonly?: boolean;
}>();

defineEmits<{
  extractCharacters: [];
  ensurePreviews: [];
  regenerateReference: [payload: { characterId: string; referenceKind: "preview_front" | "final_reference"; input: UpdateProjectCharacterRequest }];
  deleteReference: [payload: { characterId: string; assetId: string }];
  confirmPreview: [payload: { characterId: string; assetId: string }];
  confirmReference: [payload: { characterId: string; assetId: string }];
}>();

const characters = computed(() => props.snapshot.characters ?? []);
const assets = computed(() => props.snapshot.assets ?? []);

const activePreview = ref<{ asset: WorkbenchAsset; alt: string } | null>(null);

function openPreview(asset: WorkbenchAsset, alt: string) {
  activePreview.value = { asset, alt };
}

function closePreview() {
  activePreview.value = null;
}

const LEVEL_LABELS: Record<ProjectCharacterLevel, string> = {
  lead: "主角",
  recurring: "常驻",
  chapter: "本章",
  extra: "临时",
};

function assetUrl(assetId: string) {
  return api.projectAssetFileUrl(props.snapshot.project.id, assetId);
}

function getAssetReferenceKind(asset: WorkbenchAsset): string | null {
  try {
    const meta = JSON.parse(asset.meta) as { referenceKind?: string };
    return meta.referenceKind ?? null;
  } catch {
    return null;
  }
}

function getAssetCreatedAt(asset: WorkbenchAsset): string {
  try {
    const meta = JSON.parse(asset.meta) as { createdAt?: string };
    return meta.createdAt ?? "";
  } catch {
    return "";
  }
}

function getReferenceAssets(character: ProjectCharacter, referenceKind: "preview_front" | "final_reference"): WorkbenchAsset[] {
  const ids = new Set(character.referenceAssetIds);
  return assets.value
    .filter((asset) => ids.has(asset.id) && getAssetReferenceKind(asset) === referenceKind)
    .sort((left, right) => Date.parse(getAssetCreatedAt(right)) - Date.parse(getAssetCreatedAt(left)));
}

function getReferenceAsset(character: ProjectCharacter, referenceKind: "preview_front" | "final_reference"): WorkbenchAsset | null {
  const latest = getReferenceAssets(character, referenceKind)[0] ?? null;
  if (referenceKind === "preview_front") {
    const confirmed = character.previewReferenceAssetId
      ? assets.value.find((asset) => asset.id === character.previewReferenceAssetId) ?? null
      : null;
    return latest ?? confirmed;
  }
  const primary = character.primaryReferenceAssetId
    ? assets.value.find((asset) => asset.id === character.primaryReferenceAssetId) ?? null
    : null;
  return primary ?? latest;
}

function getLevelLabel(level: ProjectCharacterLevel) {
  return LEVEL_LABELS[level] ?? level;
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

.characters-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  border: 1px solid rgba(148, 163, 184, 0.16);
  border-radius: 8px;
  background: rgba(15, 23, 42, 0.62);
  padding: 14px 16px;
}

.characters-header span {
  color: #8df0dc;
  font-size: 12px;
  font-weight: 900;
}

.characters-header h2 {
  margin: 4px 0 0;
  color: #f8fbff;
  font-size: 18px;
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

.row-image-frame.is-clickable {
  cursor: zoom-in;
  padding: 0;
  border: 1px solid rgba(148, 163, 184, 0.18);
  transition: border-color 0.16s ease;
}

.row-image-frame.is-clickable:hover {
  border-color: rgba(139, 92, 246, 0.5);
}

/* 图片预览大图弹窗 */
.preview-backdrop {
  position: fixed;
  inset: 0;
  z-index: 90;
  display: grid;
  place-items: center;
  gap: 14px;
  grid-auto-flow: row;
  background: rgba(2, 6, 23, 0.88);
  backdrop-filter: blur(12px);
  padding: 32px;
}

.preview-image {
  max-width: min(92vw, 1200px);
  max-height: 80vh;
  border-radius: 10px;
  object-fit: contain;
  box-shadow: 0 24px 80px rgba(0, 0, 0, 0.6);
}

.preview-caption {
  color: #cbd5e1;
  font-size: 13px;
  font-weight: 800;
}

.preview-close {
  position: fixed;
  top: 20px;
  right: 20px;
  display: grid;
  width: 40px;
  height: 40px;
  place-items: center;
  border: 1px solid rgba(148, 163, 184, 0.2);
  border-radius: 8px;
  background: rgba(15, 23, 42, 0.82);
  color: #f8fbff;
}

.preview-close:hover {
  background: rgba(15, 23, 42, 0.95);
}

.characters-scroll {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-height: 0;
  overflow: auto;
  padding-right: 6px;
}

.empty-state {
  display: grid;
  flex: 1 1 auto;
  place-items: center;
  min-height: 260px;
  border: 1px solid rgba(148, 163, 184, 0.16);
  border-radius: 8px;
  background: rgba(15, 23, 42, 0.62);
  color: #94a3b8;
  text-align: center;
  padding: 24px;
}

.empty-state h3 {
  margin: 8px 0 4px;
  color: #f8fbff;
}

.empty-state p {
  margin: 0;
}

/* 列表行布局 */
.character-rows {
  display: grid;
  gap: 10px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.character-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 18px;
  border: 1px solid rgba(148, 163, 184, 0.14);
  border-radius: 10px;
  background: rgba(15, 23, 42, 0.5);
  padding: 14px 16px;
}

.row-info {
  display: grid;
  gap: 6px;
  min-width: 0;
}

.row-title {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.row-title strong {
  color: #f8fbff;
  font-size: 16px;
  font-weight: 900;
}

.row-level {
  flex: 0 0 auto;
  border: 1px solid rgba(34, 199, 169, 0.4);
  border-radius: 999px;
  background: rgba(34, 199, 169, 0.14);
  color: #8df0dc;
  padding: 2px 9px;
  font-size: 11px;
  font-weight: 900;
}

.row-desc {
  margin: 0;
  color: #cbd5e1;
  font-size: 13px;
  line-height: 1.65;
  display: -webkit-box;
  overflow: hidden;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 3;
}

/* 右侧双图 */
.row-images {
  display: flex;
  gap: 10px;
  flex: 0 0 auto;
}

.row-image-slot {
  display: grid;
  gap: 4px;
  width: 130px;
}

.row-image-frame {
  display: grid;
  place-items: center;
  overflow: hidden;
  border-radius: 8px;
  background: rgba(2, 6, 23, 0.6);
  aspect-ratio: 1 / 1;
}

.row-image-frame img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.row-image-empty {
  display: grid;
  place-items: center;
  gap: 4px;
  color: #475569;
  font-size: 11px;
}

.row-image-label {
  color: #8df0dc;
  font-size: 11px;
  font-weight: 900;
  text-align: center;
}

@media (max-width: 720px) {
  .character-row {
    grid-template-columns: minmax(0, 1fr);
    gap: 12px;
  }

  .row-images {
    width: 100%;
    justify-content: stretch;
  }

  .row-image-slot {
    width: auto;
    flex: 1 1 0;
  }
}
</style>
