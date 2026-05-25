<template>
  <section class="workflow-bar" aria-label="创作流程">
    <span class="workflow-label">创作流程</span>
    <div class="workflow-steps">
      <template v-for="(step, index) in steps" :key="step.title">
        <div class="wf-step">
          <div class="wf-icon">
            <component :is="step.icon" :size="18" />
          </div>
          <div class="wf-text">
            <strong>{{ step.title }}</strong>
            <span>{{ step.subtitle }}</span>
          </div>
        </div>
        <ChevronRight v-if="index < steps.length - 1" :size="16" class="wf-arrow" />
      </template>
    </div>
  </section>
</template>

<script setup lang="ts">
import { BookOpenText, ChevronRight, Images, LayoutPanelTop, ListTree, PackageCheck, PanelsTopLeft } from "lucide-vue-next";

const steps = [
  { title: "项目与故事", subtitle: "保存设定与故事", icon: BookOpenText },
  { title: "剧情结构", subtitle: "整理摘要与节拍", icon: ListTree },
  { title: "分镜工作台", subtitle: "编辑镜头列表", icon: PanelsTopLeft },
  { title: "候选图工作台", subtitle: "筛选最佳候选图", icon: Images },
  { title: "排版导出", subtitle: "排版并导出成品", icon: LayoutPanelTop },
  { title: "素材包", subtitle: "归档项目素材", icon: PackageCheck },
] as const;
</script>
