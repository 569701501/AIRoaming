<template>
  <section class="asset-package-workspace" aria-label="素材包工作台">
    <header class="package-toolbar">
      <div class="chapter-picker">
        <Package :size="18" />
        <select :value="currentChapterId ?? ''" :disabled="loading" @change="selectChapter">
          <option v-for="chapter in chapters" :key="chapter.id" :value="chapter.id">
            {{ chapter.title }} · {{ getChapterLabel(chapter) }}
          </option>
        </select>
      </div>
      <div class="package-actions">
        <button class="secondary-action" type="button" :disabled="loading" @click="$emit('goLayout')">
          <LayoutTemplate :size="15" />
          <span>排版导出</span>
        </button>
        <button class="primary-action" type="button" :disabled="loading || !canExport" @click="$emit('exportPackage')">
          <Archive :size="15" />
          <span>导出素材包</span>
        </button>
      </div>
    </header>

    <div v-if="!isLayoutDone" class="package-empty">
      <Lock :size="22" />
      <h2>请先完成排版导出</h2>
      <p>素材包会打包本章剧本、结构、分镜、锁定候选图和导出页，并生成 manifest.json。</p>
      <button class="empty-action" type="button" :disabled="loading" @click="$emit('goLayout')">
        <LayoutTemplate :size="15" />
        <span>去排版导出</span>
      </button>
    </div>

    <div v-else class="package-content">
      <section class="package-card">
        <h2>将包含的内容</h2>
        <ul>
          <li>章节剧本 script.md</li>
          <li>剧情结构 structure.json</li>
          <li>正式分镜 storyboard.json</li>
          <li>出图准备 preflight.json</li>
          <li>候选图索引 candidates.json</li>
          <li>排版 layout/layout.json</li>
          <li>已锁定候选图与导出页 PNG/WebP</li>
          <li>项目角色索引 shared/characters.json</li>
          <li>可追溯清单 manifest.json</li>
        </ul>
      </section>

      <section class="package-card">
        <h2>最近素材包</h2>
        <div v-if="packageAssets.length === 0" class="package-none">
          <Archive :size="18" />
          <span>还没有导出素材包。</span>
        </div>
        <article v-for="asset in packageAssets" :key="asset.id" class="package-item">
          <strong>{{ asset.name }}</strong>
          <span>{{ asset.path }}</span>
          <small>{{ getPackageMeta(asset) }}</small>
        </article>
      </section>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { Archive, LayoutTemplate, Lock, Package } from "lucide-vue-next";
import type { ChapterListItem, WorkbenchAsset, WorkbenchSnapshot } from "@airoaming/shared";

const props = defineProps<{
  snapshot: WorkbenchSnapshot;
  loading: boolean;
}>();

const emit = defineEmits<{
  selectChapter: [chapterId: string];
  exportPackage: [];
  goLayout: [];
}>();

const chapters = computed(() => props.snapshot.chapters ?? []);
const currentChapter = computed(() => props.snapshot.currentChapter);
const currentChapterId = computed(() => currentChapter.value?.id ?? null);
const isLayoutDone = computed(() => {
  const status = currentChapter.value?.status;
  return status === "layout_done" || status === "exported";
});
const canExport = computed(() => isLayoutDone.value);
const packageAssets = computed(() =>
  props.snapshot.assets
    .filter((asset) => asset.chapterId === currentChapterId.value && isPackageAsset(asset))
    .slice()
    .reverse(),
);

function isPackageAsset(asset: WorkbenchAsset): boolean {
  if (asset.type === "archive") return true;
  try {
    const meta = JSON.parse(asset.meta || "{}") as { kind?: string };
    return meta.kind === "asset_package";
  } catch {
    return false;
  }
}

function getPackageMeta(asset: WorkbenchAsset): string {
  try {
    const meta = JSON.parse(asset.meta || "{}") as { packageId?: string; fileCount?: number; createdAt?: string };
    const parts = [
      meta.packageId ? `ID ${meta.packageId}` : null,
      typeof meta.fileCount === "number" ? `${meta.fileCount} 个文件` : null,
      meta.createdAt ? meta.createdAt.replace("T", " ").slice(0, 19) : null,
    ].filter(Boolean);
    return parts.join(" · ") || asset.type;
  } catch {
    return asset.type;
  }
}

function selectChapter(event: Event) {
  const chapterId = (event.target as HTMLSelectElement).value;
  if (chapterId) {
    emit("selectChapter", chapterId);
  }
}

function getChapterLabel(chapter: ChapterListItem): string {
  if (chapter.status === "exported") return "已打包";
  if (chapter.status === "layout_done") return "可打包";
  return "未就绪";
}
</script>

<style scoped>
.asset-package-workspace {
  display: grid;
  grid-template-rows: auto 1fr;
  min-height: 0;
  height: 100%;
  gap: 14px;
}

.package-toolbar,
.package-actions,
.chapter-picker {
  display: flex;
  align-items: center;
  gap: 10px;
}

.package-toolbar {
  justify-content: space-between;
  flex-wrap: wrap;
}

.chapter-picker select {
  min-width: 180px;
  border: 1px solid rgba(148, 163, 184, 0.25);
  background: rgba(15, 23, 42, 0.55);
  color: #e2e8f0;
  border-radius: 10px;
  padding: 8px 10px;
}

.primary-action,
.secondary-action,
.empty-action {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border-radius: 12px;
  border: 1px solid transparent;
  padding: 9px 12px;
  font-weight: 700;
  cursor: pointer;
}

.primary-action {
  background: linear-gradient(135deg, #0f766e, #2563eb);
  color: white;
}

.secondary-action,
.empty-action {
  background: rgba(30, 41, 59, 0.9);
  border-color: rgba(148, 163, 184, 0.2);
  color: #e2e8f0;
}

.primary-action:disabled,
.secondary-action:disabled,
.empty-action:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.package-empty {
  display: grid;
  place-content: center;
  gap: 10px;
  justify-items: center;
  color: #94a3b8;
  text-align: center;
  min-height: 320px;
}

.package-content {
  display: grid;
  grid-template-columns: 1.1fr 1fr;
  gap: 14px;
  min-height: 0;
}

.package-card {
  display: grid;
  gap: 12px;
  align-content: start;
  padding: 16px;
  border-radius: 16px;
  background: rgba(15, 23, 42, 0.55);
  border: 1px solid rgba(148, 163, 184, 0.15);
  overflow: auto;
}

.package-card h2 {
  margin: 0;
  font-size: 16px;
}

.package-card ul {
  margin: 0;
  padding-left: 18px;
  color: #cbd5e1;
  line-height: 1.7;
}

.package-none {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #94a3b8;
}

.package-item {
  display: grid;
  gap: 4px;
  padding: 12px;
  border-radius: 12px;
  background: rgba(2, 6, 23, 0.45);
  border: 1px solid rgba(148, 163, 184, 0.12);
}

.package-item span,
.package-item small {
  color: #94a3b8;
  font-size: 12px;
  word-break: break-all;
}

@media (max-width: 960px) {
  .package-content {
    grid-template-columns: 1fr;
  }
}
</style>
