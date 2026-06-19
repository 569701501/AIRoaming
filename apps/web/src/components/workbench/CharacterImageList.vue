<template>
  <section class="character-image-list" :class="{ 'is-compact': compact }" aria-label="角色图列表">
    <header v-if="title || subtitle" class="list-header">
      <div>
        <span v-if="subtitle">{{ subtitle }}</span>
        <h3 v-if="title">{{ title }}</h3>
      </div>
      <slot name="actions" />
    </header>

    <div v-if="characters.length === 0" class="empty-state">
      <UserRound :size="22" />
      <strong>{{ emptyTitle }}</strong>
      <span>{{ emptyText }}</span>
    </div>

    <div v-else class="image-grid">
      <article v-for="character in characters" :key="character.id" class="image-card">
        <div class="image-frames">
          <!-- 角色图(预览图)区:名字+按钮叠加在图上 -->
          <div class="frame-slot">
            <div class="image-frame is-primary">
              <button
                v-if="getReferenceAsset(character, 'preview_front')"
                class="image-preview"
                type="button"
                @click="openPreviewFor(character, 'preview_front')"
              >
                <img :src="assetUrl(getReferenceAsset(character, 'preview_front')!.id)" :alt="`${character.name} 角色图`" />
              </button>
              <div v-else class="image-placeholder" :class="{ 'is-active': isReferenceTaskActive(character, 'preview_front') }">
                <LoaderCircle v-if="isReferenceTaskActive(character, 'preview_front')" :size="22" />
                <ImagePlus v-else :size="22" />
                <strong>{{ isReferenceTaskActive(character, 'preview_front') ? '生成中' : '待生成' }}</strong>
              </div>

              <!-- 顶部叠加:名字 + 层级 -->
              <div class="overlay-top">
                <strong class="overlay-name">{{ character.name }}</strong>
                <span class="overlay-level">{{ getLevelLabel(character.level) }}</span>
              </div>

              <!-- 状态 B(未定稿)右上角常驻🔄:重新生成角色图 -->
              <button
                v-if="isPendingFinalize(character)"
                type="button"
                class="icon-corner"
                title="重新生成角色图"
                @click="openEdit(character, 'preview_front')"
              >
                <RotateCw :size="15" />
              </button>

              <!-- 锁定标记:已定稿后角色图不可改 -->
              <span v-if="isFinalized(character)" class="lock-badge" title="角色图已锁定"><Lock :size="13" /></span>

              <!-- 底部叠加:操作按钮 -->
              <div v-if="!isFullyLocked(character)" class="overlay-actions">
                <button
                  v-if="!getReferenceAsset(character, 'preview_front') && canGenerateReference(character, 'preview_front')"
                  class="overlay-btn"
                  type="button"
                  :disabled="loading || hasActiveTask(character)"
                  @click="openEdit(character, 'preview_front')"
                >
                  <ImagePlus :size="14" />
                  <span>生成角色图</span>
                </button>
                <button
                  v-if="canFinalizePreview(character)"
                  class="overlay-btn is-primary"
                  type="button"
                  :disabled="loading || hasActiveTask(character)"
                  @click="finalizePreview(character)"
                >
                  <CheckCircle2 :size="14" />
                  <span>定稿</span>
                </button>
                <button
                  v-if="canConfirmFinalReference(character)"
                  class="overlay-btn is-primary"
                  type="button"
                  :disabled="loading"
                  @click="confirmFinalReference(character)"
                >
                  <CheckCircle2 :size="14" />
                  <span>锁定定稿</span>
                </button>
              </div>
            </div>
          </div>

          <!-- 三向图(定稿图)区 -->
          <div class="frame-slot">
            <div class="image-frame">
              <button
                v-if="getReferenceAsset(character, 'final_reference')"
                class="image-preview"
                type="button"
                @click="onFinalReferenceClick(character)"
              >
                <img :src="assetUrl(getReferenceAsset(character, 'final_reference')!.id)" :alt="`${character.name} 三向图`" />
                <span class="view-badge"><ZoomIn :size="14" /> 查看</span>
              </button>
              <div v-else class="image-placeholder" :class="{ 'is-active': isReferenceTaskActive(character, 'final_reference') }">
                <LoaderCircle v-if="isReferenceTaskActive(character, 'final_reference')" :size="22" />
                <ImagePlus v-else :size="22" />
                <strong>{{ isReferenceTaskActive(character, 'final_reference') ? '生成中' : '未生成' }}</strong>
              </div>
              <span class="frame-tag">三向图</span>
            </div>
          </div>
        </div>
      </article>
    </div>

    <Teleport to="body">
      <div v-if="activePreview" class="modal-backdrop" role="dialog" aria-modal="true" @click.self="activePreview = null">
        <section class="image-modal">
          <button class="modal-close" type="button" aria-label="关闭图片预览" @click="activePreview = null">
            <X :size="18" />
          </button>
          <div class="modal-heading">
            <span>{{ activePreview.kind === "final_reference" ? "角色定稿" : "角色图" }}</span>
            <h3>{{ activePreview.character.name }}</h3>
          </div>
          <img :src="assetUrl(activePreview.asset.id)" :alt="`${activePreview.character.name} 角色图`" />
        </section>
      </div>

      <div v-if="editDraft" class="modal-backdrop" role="dialog" aria-modal="true" @click.self="closeEdit">
        <section class="edit-modal">
          <button class="modal-close" type="button" aria-label="关闭角色图编辑" @click="closeEdit">
            <X :size="18" />
          </button>

          <div class="edit-preview">
            <img v-if="editDraft.asset" :src="assetUrl(editDraft.asset.id)" :alt="`${editDraft.character.name} 当前角色图`" />
            <div v-else class="edit-placeholder">
              <ImagePlus :size="28" />
              <strong>还没有角色图</strong>
            </div>
            <span>{{ editDraft.referenceKind === "final_reference" ? "定稿图" : "角色图" }}</span>
          </div>

          <div class="edit-form">
            <div class="modal-heading">
              <span>角色图片生成</span>
              <h3>{{ editDraft.referenceKind === "final_reference" ? "生成角色定稿" : "生成角色图" }}</h3>
            </div>

            <label class="field">
              <span>角色名</span>
              <input :value="editDraft.character.name" readonly />
            </label>

            <div class="field">
              <span>图片类型</span>
              <div class="reference-tabs" role="tablist" aria-label="图片类型">
                <button
                  type="button"
                  :class="{ 'is-active': editDraft.referenceKind === 'preview_front' }"
                  @click="editDraft.referenceKind = 'preview_front'"
                >
                  角色图
                </button>
                <button
                  type="button"
                  :disabled="!canGenerateReference(editDraft.character, 'final_reference') && editDraft.referenceKind !== 'final_reference'"
                  :class="{ 'is-active': editDraft.referenceKind === 'final_reference' }"
                  @click="editDraft.referenceKind = 'final_reference'"
                >
                  定稿图
                </button>
              </div>
            </div>

            <label class="field">
              <span>生图描述</span>
              <textarea
                v-model="editDraft.description"
                rows="8"
                placeholder="写这个角色图要长什么样。这里会作为 AI 生图提示词，不会修改角色名字。"
              />
            </label>

            <footer class="modal-actions">
              <button class="cancel-action" type="button" @click="closeEdit">取消</button>
              <button
                class="primary-action"
                type="button"
                :disabled="loading || !editDraft.description.trim() || !canGenerateReference(editDraft.character, editDraft.referenceKind)"
                @click="submitEdit"
              >
                <RotateCw :size="15" />
                <span>{{ editDraft.asset ? "重新生成并替换" : "生成角色图" }}</span>
              </button>
            </footer>
          </div>
        </section>
      </div>

      <div v-if="deleteTarget" class="modal-backdrop" role="dialog" aria-modal="true" @click.self="deleteTarget = null">
        <section class="delete-modal">
          <button class="modal-close" type="button" aria-label="关闭删除确认" @click="deleteTarget = null">
            <X :size="18" />
          </button>
          <div class="modal-heading">
            <span>删除图片</span>
            <h3>删除{{ deleteTarget.character.name }}当前图片？</h3>
          </div>
          <p>这只会删除当前显示的图片版本，不会删除角色，也不会修改角色名字。</p>
          <footer class="modal-actions">
            <button class="cancel-action" type="button" @click="deleteTarget = null">取消</button>
            <button class="danger-action" type="button" :disabled="loading" @click="submitDelete">
              <Trash2 :size="15" />
              <span>删除当前图片</span>
            </button>
          </footer>
        </section>
      </div>
    </Teleport>
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { CheckCircle2, ImagePlus, LoaderCircle, Lock, Pencil, RotateCw, Trash2, UserRound, X, ZoomIn } from "lucide-vue-next";
import type {
  GenerationTaskItem,
  ProjectCharacter,
  ProjectCharacterLevel,
  ProjectCharacterReferenceKind,
  UpdateProjectCharacterRequest,
  WorkbenchAsset,
  WorkbenchSnapshot,
} from "@airoaming/shared";
import { api } from "../../services/api";

type ReferenceKind = Exclude<ProjectCharacterReferenceKind, "none">;

const props = withDefaults(defineProps<{
  snapshot: WorkbenchSnapshot;
  characters: ProjectCharacter[];
  tasks: GenerationTaskItem[];
  loading: boolean;
  title?: string;
  subtitle?: string;
  emptyTitle?: string;
  emptyText?: string;
  compact?: boolean;
  /** 锁定模式:none=正常可编辑;fully-locked=老角色纯展示,隐藏所有编辑/删除/生成入口 */
  lockMode?: "none" | "fully-locked";
}>(), {
  title: "",
  subtitle: "",
  emptyTitle: "还没有角色",
  emptyText: "先从剧本大纲或本章剧情结构里提取角色。",
  compact: false,
  lockMode: "none",
});

const emit = defineEmits<{
  regenerateReference: [payload: { characterId: string; referenceKind: ReferenceKind; input: UpdateProjectCharacterRequest }];
  deleteReference: [payload: { characterId: string; assetId: string }];
  confirmPreview: [payload: { characterId: string; assetId: string }];
  confirmReference: [payload: { characterId: string; assetId: string }];
}>();

const activePreview = ref<{ character: ProjectCharacter; asset: WorkbenchAsset; kind: ReferenceKind } | null>(null);
const editDraft = ref<{
  character: ProjectCharacter;
  asset: WorkbenchAsset | null;
  referenceKind: ReferenceKind;
  description: string;
} | null>(null);
const deleteTarget = ref<{ character: ProjectCharacter; asset: WorkbenchAsset } | null>(null);

const assets = computed(() => props.snapshot.assets ?? []);

function getReferenceAssets(character: ProjectCharacter, referenceKind: ReferenceKind): WorkbenchAsset[] {
  const ids = new Set(character.referenceAssetIds);
  return assets.value
    .filter((asset) => ids.has(asset.id) && getAssetReferenceKind(asset) === referenceKind)
    .sort((left, right) => Date.parse(getAssetCreatedAt(right)) - Date.parse(getAssetCreatedAt(left)));
}

function getReferenceAsset(character: ProjectCharacter, referenceKind: ReferenceKind): WorkbenchAsset | null {
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
  return latest ?? primary;
}

function getAssetReferenceKind(asset: WorkbenchAsset): ProjectCharacterReferenceKind | null {
  try {
    const meta = JSON.parse(asset.meta) as { referenceKind?: unknown };
    if (meta.referenceKind === "turnaround_4view") return "final_reference";
    if (meta.referenceKind === "single_front") return "preview_front";
    return meta.referenceKind === "preview_front" || meta.referenceKind === "final_reference" || meta.referenceKind === "none"
      ? meta.referenceKind
      : null;
  } catch {
    return null;
  }
}

function getAssetCreatedAt(asset: WorkbenchAsset) {
  try {
    const meta = JSON.parse(asset.meta) as { createdAt?: unknown };
    return typeof meta.createdAt === "string" ? meta.createdAt : "1970-01-01T00:00:00.000Z";
  } catch {
    return "1970-01-01T00:00:00.000Z";
  }
}

function assetUrl(assetId: string) {
  return api.projectAssetFileUrl(props.snapshot.project.id, assetId);
}

function getReferenceTask(character: ProjectCharacter, referenceKind: ReferenceKind): GenerationTaskItem | null {
  return props.tasks
    .filter((task) =>
      task.projectId === props.snapshot.project.id
      && task.type === "character_reference_generate"
      && task.target?.type === "character"
      && task.target.id === character.id
      && task.input.referenceKind === referenceKind,
    )
    .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt))[0] ?? null;
}

function isReferenceTaskActive(character: ProjectCharacter, referenceKind: ReferenceKind) {
  const task = getReferenceTask(character, referenceKind);
  return task?.status === "queued" || task?.status === "running" || task?.status === "retrying";
}

function isReferenceTaskFailed(character: ProjectCharacter, referenceKind: ReferenceKind) {
  return getReferenceTask(character, referenceKind)?.status === "failed";
}

function hasActiveTask(character: ProjectCharacter) {
  return isReferenceTaskActive(character, "preview_front") || isReferenceTaskActive(character, "final_reference");
}

function hasFailedTask(character: ProjectCharacter) {
  return isReferenceTaskFailed(character, "preview_front") || isReferenceTaskFailed(character, "final_reference");
}

function isLocked(character: ProjectCharacter) {
  return character.status === "in_use";
}

/**
 * 老角色完全锁死:仅当 lockMode=fully-locked 且角色已有三向图(已定稿)时才锁死,纯展示🔒。
 * 无图的角色(哪怕是主角/常驻,刚建档还没生成图)不锁,允许生成角色图。
 */
function isFullyLocked(character: ProjectCharacter) {
  return props.lockMode === "fully-locked" && isFinalized(character);
}

/** 状态 B(新角色):有预览图、无三向图、未锁定 → 显示左上角🔄刷新 */
function isPendingFinalize(character: ProjectCharacter) {
  if (isLocked(character) || isFullyLocked(character)) {
    return false;
  }
  return Boolean(getReferenceAsset(character, "preview_front")) && !getReferenceAsset(character, "final_reference");
}

/** 状态 D(已定稿):有三向图 → 角色图锁定,但三向图保留编辑入口 */
function isFinalized(character: ProjectCharacter) {
  return Boolean(getReferenceAsset(character, "final_reference"));
}

function canGenerateReference(character: ProjectCharacter, referenceKind: ReferenceKind) {
  if (isLocked(character) || isReferenceTaskActive(character, referenceKind)) {
    return false;
  }
  if (referenceKind === "final_reference" && (!getReferenceAsset(character, "preview_front") || character.level === "extra")) {
    return false;
  }
  return true;
}

function canConfirmFinalReference(character: ProjectCharacter) {
  const asset = getReferenceAsset(character, "final_reference");
  return Boolean(asset && character.primaryReferenceAssetId !== asset.id && !isLocked(character));
}

function confirmFinalReference(character: ProjectCharacter) {
  const asset = getReferenceAsset(character, "final_reference");
  if (asset) {
    emit("confirmReference", { characterId: character.id, assetId: asset.id });
  }
}

/** 状态 B 可定稿:有预览图、无三向图、非 extra、非锁定、无活跃任务 → 显示"定稿"主按钮 */
function canFinalizePreview(character: ProjectCharacter) {
  if (isLocked(character) || isFullyLocked(character) || character.level === "extra") {
    return false;
  }
  return Boolean(getReferenceAsset(character, "preview_front")) && !getReferenceAsset(character, "final_reference");
}

/** 定稿:锁定当前预览图 + 后端自动触发三向图生成 */
function finalizePreview(character: ProjectCharacter) {
  const asset = getReferenceAsset(character, "preview_front");
  if (asset) {
    emit("confirmPreview", { characterId: character.id, assetId: asset.id });
  }
}

function getCharacterDescription(character: ProjectCharacter) {
  const description = [character.role, character.appearance, character.personality]
    .map((item) => item.trim())
    .filter(Boolean)
    .join("，");
  return description || character.promptFragment || "暂无角色描述";
}

function getPromptDescription(character: ProjectCharacter) {
  return character.promptFragment || character.appearance || getCharacterDescription(character);
}

function getLevelLabel(level: ProjectCharacterLevel) {
  const labels: Record<ProjectCharacterLevel, string> = {
    lead: "主角",
    recurring: "常驻",
    chapter: "本章",
    extra: "临时",
  };
  return labels[level];
}

function getCardStateLabel(character: ProjectCharacter) {
  if (hasActiveTask(character)) {
    return "生成中";
  }
  if (hasFailedTask(character)) {
    return "生成失败，可重新生成";
  }
  if (character.status === "in_use") {
    return "已用于出图，不能替换";
  }
  const finalAsset = getReferenceAsset(character, "final_reference");
  if (finalAsset) {
    return character.primaryReferenceAssetId === finalAsset.id ? "定稿已锁定" : "定稿待锁定";
  }
  const previewAsset = getReferenceAsset(character, "preview_front");
  if (previewAsset) {
    return character.level === "extra" ? "已有角色图" : "待生成定稿";
  }
  return "待生成角色图";
}

function openPreviewFor(character: ProjectCharacter, referenceKind: ReferenceKind) {
  const asset = getReferenceAsset(character, referenceKind);
  if (!asset) return;
  activePreview.value = {
    character,
    asset,
    kind: referenceKind,
  };
}

/** 三向图点击:已定稿(角色图锁定)→ 弹编辑窗重生三向图;未定稿 → 仅查看预览 */
function onFinalReferenceClick(character: ProjectCharacter) {
  if (isFinalized(character)) {
    openEdit(character, "final_reference");
  } else {
    openPreviewFor(character, "final_reference");
  }
}

function openEdit(character: ProjectCharacter, referenceKind: ReferenceKind) {
  if (!canGenerateReference(character, referenceKind) && !getReferenceAsset(character, referenceKind)) {
    return;
  }
  editDraft.value = {
    character,
    asset: getReferenceAsset(character, referenceKind),
    referenceKind,
    description: getPromptDescription(character),
  };
}

function closeEdit() {
  editDraft.value = null;
}

function submitEdit() {
  if (!editDraft.value) return;
  const description = editDraft.value.description.trim();
  if (!description) return;
  emit("regenerateReference", {
    characterId: editDraft.value.character.id,
    referenceKind: editDraft.value.referenceKind,
    input: {
      appearance: description,
      promptFragment: description,
    },
  });
  closeEdit();
}

function openDelete(character: ProjectCharacter) {
  const asset = getReferenceAsset(character, "preview_front");
  if (asset) {
    deleteTarget.value = { character, asset };
  }
}

function submitDelete() {
  if (!deleteTarget.value) return;
  emit("deleteReference", {
    characterId: deleteTarget.value.character.id,
    assetId: deleteTarget.value.asset.id,
  });
  deleteTarget.value = null;
}
</script>

<style scoped>
.character-image-list {
  display: grid;
  gap: 12px;
  min-width: 0;
}

.list-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-width: 0;
}

.list-header span,
.modal-heading span,
.field span {
  color: #8df0dc;
  font-size: 12px;
  font-weight: 900;
}

.list-header h3,
.modal-heading h3 {
  margin: 4px 0 0;
  color: #f8fbff;
}

.image-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 12px;
}

.character-image-list.is-compact .image-grid {
  grid-template-columns: minmax(0, 1fr);
}

.image-card,
.empty-state,
.edit-modal,
.image-modal,
.delete-modal {
  border: 1px solid rgba(148, 163, 184, 0.16);
  border-radius: 8px;
  background: rgba(15, 23, 42, 0.68);
}

.image-card {
  padding: 10px;
}

.image-frames {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  min-width: 0;
}

.frame-slot {
  display: grid;
  min-width: 0;
}

.image-frame {
  position: relative;
  overflow: hidden;
  border-radius: 10px;
  background: rgba(2, 6, 23, 0.48);
  height: 140px;
}

.lock-badge {
  position: absolute;
  top: 6px;
  right: 6px;
  display: grid;
  width: 26px;
  height: 26px;
  place-items: center;
  border-radius: 6px;
  background: rgba(15, 23, 42, 0.82);
  color: #8df0dc;
}

.image-preview,
.image-placeholder {
  display: grid;
  width: 100%;
  height: 100%;
  border: 0;
  padding: 0;
}

.image-preview {
  position: relative;
  cursor: zoom-in;
}

.image-preview img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.view-badge {
  position: absolute;
  right: 8px;
  bottom: 8px;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  border-radius: 999px;
  background: rgba(15, 23, 42, 0.78);
  color: #f8fbff;
  padding: 5px 8px;
  font-size: 12px;
  font-weight: 900;
}

.image-placeholder {
  place-items: center;
  color: #94a3b8;
  text-align: center;
  padding: 16px;
}

.image-placeholder svg,
.image-placeholder.is-active svg {
  color: #a78bfa;
}

.image-placeholder.is-active svg {
  animation: spin 1s linear infinite;
}

/* 角色图上的叠加层 */
.overlay-top {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  background: linear-gradient(to bottom, rgba(2, 6, 23, 0.82), rgba(2, 6, 23, 0));
  pointer-events: none;
}

.overlay-name {
  color: #f8fbff;
  font-size: 15px;
  font-weight: 900;
  letter-spacing: 0.2px;
  text-shadow: 0 1px 4px rgba(0, 0, 0, 0.6);
}

.overlay-level {
  flex: 0 0 auto;
  border: 1px solid rgba(34, 199, 169, 0.4);
  border-radius: 999px;
  background: rgba(34, 199, 169, 0.16);
  color: #8df0dc;
  padding: 2px 8px;
  font-size: 11px;
  font-weight: 900;
}

.icon-corner {
  position: absolute;
  top: 10px;
  right: 10px;
  display: grid;
  width: 30px;
  height: 30px;
  place-items: center;
  border: 1px solid rgba(255, 255, 255, 0.18);
  border-radius: 8px;
  background: rgba(15, 23, 42, 0.82);
  color: #f8fbff;
  opacity: 0.92;
  transition: opacity 0.16s ease, transform 0.16s ease;
}

.icon-corner:hover {
  opacity: 1;
  transform: rotate(90deg);
}

.frame-tag {
  position: absolute;
  top: 10px;
  left: 10px;
  border-radius: 999px;
  background: rgba(15, 23, 42, 0.82);
  color: #8df0dc;
  padding: 3px 9px;
  font-size: 11px;
  font-weight: 900;
}

.overlay-actions {
  position: absolute;
  left: 10px;
  right: 10px;
  bottom: 10px;
  display: flex;
  gap: 8px;
}

.overlay-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  flex: 1;
  min-height: 34px;
  border: 1px solid rgba(204, 215, 245, 0.2);
  border-radius: 8px;
  background: rgba(15, 23, 42, 0.88);
  color: #f8fbff;
  padding: 0 10px;
  font-size: 13px;
  font-weight: 800;
  backdrop-filter: blur(4px);
}

.overlay-btn.is-primary {
  border-color: rgba(34, 199, 169, 0.5);
  background: rgba(34, 199, 169, 0.22);
  color: #8df0dc;
}

.overlay-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.image-hover-actions {
  position: absolute;
  top: 8px;
  right: 8px;
  display: flex;
  gap: 6px;
  opacity: 0;
  transform: translateY(-4px);
  transition: opacity 0.16s ease, transform 0.16s ease;
}

.image-card:hover .image-hover-actions {
  opacity: 1;
  transform: translateY(0);
}

.image-hover-actions button {
  display: grid;
  width: 32px;
  height: 32px;
  place-items: center;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 8px;
  background: rgba(15, 23, 42, 0.82);
  color: #f8fbff;
}

.card-body {
  display: grid;
  gap: 6px;
  min-width: 0;
}

.card-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.card-title strong {
  overflow: hidden;
  color: #f8fbff;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.card-title span {
  flex: 0 0 auto;
  border: 1px solid rgba(34, 199, 169, 0.2);
  border-radius: 999px;
  color: #8df0dc;
  padding: 2px 7px;
  font-size: 11px;
  font-weight: 900;
}

.card-left {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  justify-content: center;
  gap: 10px;
  min-width: 0;
}

.card-desc {
  display: -webkit-box;
  margin: 0;
  overflow: hidden;
  color: #cbd5e1;
  font-size: 12px;
  line-height: 1.55;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 3;
}

.card-body em {
  color: #94a3b8;
  font-size: 12px;
  font-style: normal;
  font-weight: 800;
}

.card-body em.is-active {
  color: #c4b5fd;
}

.card-body em.is-warning {
  color: #fca5a5;
}

.card-actions,
.modal-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.secondary-action,
.ghost-action,
.primary-action,
.cancel-action,
.danger-action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: 34px;
  border-radius: 8px;
  padding: 0 10px;
  font-size: 12px;
  font-weight: 900;
}

.secondary-action {
  border: 1px solid rgba(34, 199, 169, 0.28);
  background: rgba(34, 199, 169, 0.12);
  color: #8df0dc;
}

.ghost-action {
  border: 1px solid rgba(139, 92, 246, 0.26);
  background: rgba(139, 92, 246, 0.1);
  color: #c4b5fd;
}

.primary-action {
  border: 1px solid rgba(34, 199, 169, 0.28);
  background: linear-gradient(135deg, rgba(34, 199, 169, 0.88), rgba(139, 92, 246, 0.72));
  color: #06111f;
}

.cancel-action {
  border: 1px solid rgba(148, 163, 184, 0.16);
  background: rgba(15, 23, 42, 0.86);
  color: #e2e8f0;
}

.danger-action {
  border: 1px solid rgba(248, 113, 113, 0.28);
  background: rgba(127, 29, 29, 0.36);
  color: #fecaca;
}

button:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

.empty-state {
  display: grid;
  place-items: center;
  gap: 8px;
  min-height: 160px;
  color: #94a3b8;
  text-align: center;
}

.empty-state strong {
  color: #f8fbff;
}

.modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 90;
  display: grid;
  place-items: center;
  background: rgba(2, 6, 23, 0.74);
  backdrop-filter: blur(16px);
  padding: 20px;
}

.image-modal,
.edit-modal,
.delete-modal {
  position: relative;
  max-height: min(880px, 92vh);
  box-shadow: 0 28px 90px rgba(0, 0, 0, 0.48);
}

.image-modal {
  display: grid;
  gap: 12px;
  width: min(920px, 94vw);
  padding: 16px;
}

.image-modal img {
  max-height: 72vh;
  width: 100%;
  border-radius: 8px;
  object-fit: contain;
  background: #020617;
}

.edit-modal {
  display: grid;
  grid-template-columns: minmax(320px, 48fr) minmax(320px, 52fr);
  gap: 18px;
  width: min(1160px, 96vw);
  padding: 18px;
}

.edit-preview {
  display: grid;
  grid-template-rows: minmax(0, 1fr) auto;
  gap: 10px;
  min-height: 0;
  border-radius: 8px;
  background: rgba(2, 6, 23, 0.42);
  padding: 10px;
}

.edit-preview img,
.edit-placeholder {
  width: 100%;
  height: min(620px, 68vh);
  border-radius: 8px;
  object-fit: contain;
  background: rgba(15, 23, 42, 0.7);
}

.edit-placeholder {
  display: grid;
  place-items: center;
  color: #94a3b8;
}

.edit-preview > span {
  color: #94a3b8;
  font-size: 12px;
  font-weight: 900;
  text-align: center;
}

.edit-form {
  display: grid;
  align-content: start;
  gap: 14px;
  min-width: 0;
}

.field {
  display: grid;
  gap: 8px;
}

.field input,
.field textarea {
  width: 100%;
  border: 1px solid rgba(148, 163, 184, 0.16);
  border-radius: 10px;
  background: rgba(2, 6, 23, 0.56);
  color: #f8fbff;
  padding: 11px 12px;
  font: inherit;
  outline: none;
}

.field input[readonly] {
  color: #94a3b8;
}

.field textarea {
  resize: vertical;
  min-height: 180px;
  line-height: 1.6;
}

.reference-tabs {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 6px;
  border-radius: 10px;
  background: rgba(2, 6, 23, 0.44);
  padding: 4px;
}

.reference-tabs button {
  min-height: 34px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: #94a3b8;
  font-weight: 900;
}

.reference-tabs button.is-active {
  background: rgba(34, 199, 169, 0.16);
  color: #8df0dc;
}

.delete-modal {
  display: grid;
  gap: 14px;
  width: min(460px, 94vw);
  padding: 18px;
}

.delete-modal p {
  margin: 0;
  color: #cbd5e1;
  line-height: 1.7;
}

.modal-close {
  position: absolute;
  top: 12px;
  right: 12px;
  display: grid;
  width: 34px;
  height: 34px;
  place-items: center;
  border: 1px solid rgba(148, 163, 184, 0.16);
  border-radius: 8px;
  background: rgba(15, 23, 42, 0.86);
  color: #f8fbff;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

@media (max-width: 860px) {
  .edit-modal {
    grid-template-columns: 1fr;
  }

  .edit-preview img,
  .edit-placeholder {
    height: 320px;
  }
}
</style>
