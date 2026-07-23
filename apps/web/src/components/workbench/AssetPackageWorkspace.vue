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
          <span>漫画成稿</span>
        </button>
        <button class="primary-action" type="button" :disabled="loading || !canExport" @click="$emit('exportPackage')">
          <Archive :size="15" />
          <span>导出素材包</span>
        </button>
      </div>
    </header>

    <div v-if="!isLayoutDone" class="package-empty">
      <Lock :size="22" />
      <h2>请先完成漫画成稿与正式导出</h2>
      <p>素材包会打包本章剧本、结构、分镜、锁定候选图和导出页，并生成可追溯的素材清单。</p>
      <button class="empty-action" type="button" :disabled="loading" @click="$emit('goLayout')">
        <LayoutTemplate :size="15" />
        <span>去漫画成稿</span>
      </button>
    </div>

    <div v-else class="package-content">
      <section class="package-card delivery-stats" aria-label="本次交付">
        <h2>本次交付</h2>
        <div class="delivery-stat-grid">
          <div v-for="stat in deliveryStats" :key="stat.label" class="delivery-stat">
            <strong>{{ stat.count }}</strong>
            <span>{{ stat.label }}</span>
          </div>
        </div>
      </section>

      <section class="package-card">
        <h2>将包含的内容</h2>
        <ul>
          <li>章节剧本</li>
          <li>剧情结构</li>
          <li>正式分镜</li>
          <li>出图准备检查记录</li>
          <li>候选图索引</li>
          <li>漫画成稿文件</li>
          <li>已锁定候选图与导出页图片</li>
          <li>项目角色索引</li>
          <li>素材清单（可追溯来源）</li>
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
          <span :title="asset.path">{{ shortPackagePath(asset.path) }}</span>
          <small>{{ getPackageMeta(asset) }}</small>
          <button class="package-copy-btn" type="button" @click="copyPackagePath(asset)">
            <Check v-if="copiedAssetId === asset.id" :size="13" />
            <Copy v-else :size="13" />
            <span>{{ copiedAssetId === asset.id ? "已复制" : "复制保存位置" }}</span>
          </button>
        </article>
      </section>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { Archive, Check, Copy, LayoutTemplate, Lock, Package } from "lucide-vue-next";
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

const deliveryStats = computed(() => {
  const lockedCount = props.snapshot.candidateSources?.candidateLockSet.entries.length
    ?? props.snapshot.shots.filter((shot) => Boolean(shot.lockedCandidateId)).length;
  const chapterId = currentChapterId.value;
  const publishedPageCount = props.snapshot.assets.filter((asset) => {
    if (asset.chapterId !== chapterId || asset.type !== "image") return false;
    try {
      return (JSON.parse(asset.meta || "{}") as { kind?: string }).kind === "layout_publication_artifact_v1";
    } catch {
      return false;
    }
  }).length;
  return [
    { label: "剧本", count: props.snapshot.currentChapter ? 1 : 0 },
    { label: "剧情结构", count: props.snapshot.storyStructure ? 1 : 0 },
    { label: "正式分镜", count: props.snapshot.shots.length },
    { label: "定稿图", count: lockedCount },
    { label: "漫画页面", count: props.snapshot.chapterLayout?.pages.length ?? publishedPageCount },
    { label: "角色素材", count: props.snapshot.characters.length },
  ];
});

function shortPackagePath(value: string) {
  const parts = value.split("/").filter(Boolean);
  return parts.length > 0 ? `…/${parts.slice(-2).join("/")}` : value;
}

const copiedAssetId = ref<string | null>(null);
let copiedTimer: ReturnType<typeof setTimeout> | null = null;

async function copyPackagePath(asset: WorkbenchAsset) {
  try {
    await navigator.clipboard.writeText(asset.path);
  } catch {
    const textarea = document.createElement("textarea");
    textarea.value = asset.path;
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand("copy");
    textarea.remove();
  }
  copiedAssetId.value = asset.id;
  if (copiedTimer) {
    clearTimeout(copiedTimer);
  }
  copiedTimer = setTimeout(() => {
    copiedAssetId.value = null;
  }, 1600);
}
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
  const hasPackageHistory = props.snapshot.assets.some((asset) => asset.chapterId === chapter.id && isPackageAsset(asset));
  if (chapter.id === currentChapterId.value) {
    const packageStep = props.snapshot.workflow.steps.find((step) => step.key === "asset_package");
    if (packageStep?.status === "done") return "已打包";
    if (hasPackageHistory) return "有历史素材包";
  } else if (hasPackageHistory) {
    return "已有素材包";
  }
  if (chapter.status === "layout_done" || chapter.status === "exported") return "可打包";
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

.delivery-stats {
  grid-column: 1 / -1;
}

.delivery-stat-grid {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 10px;
}

.delivery-stat {
  display: grid;
  justify-items: center;
  gap: 4px;
  border: 1px solid rgba(139, 92, 246, 0.16);
  border-radius: 12px;
  background: rgba(139, 92, 246, 0.07);
  padding: 12px 8px;
}

.delivery-stat strong {
  color: #d8ccff;
  font-size: 20px;
  font-weight: 800;
}

.delivery-stat span {
  color: #94a3b8;
  font-size: 12px;
}

@media (max-width: 960px) {
  .delivery-stat-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
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

.package-copy-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  justify-self: start;
  min-height: 28px;
  border: 1px solid rgba(139, 92, 246, 0.28);
  border-radius: 8px;
  background: rgba(139, 92, 246, 0.08);
  color: #c4b5fd;
  padding: 0 10px;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
}

.package-copy-btn:hover {
  background: rgba(139, 92, 246, 0.16);
}

@media (max-width: 960px) {
  .package-content {
    grid-template-columns: 1fr;
  }
}
</style>
