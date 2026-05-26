<template>
  <aside class="script-outline-panel" aria-label="剧本大纲">
    <div class="outline-header">
      <h3>剧本大纲</h3>
      <button class="collapse-btn" type="button">
        <ChevronLeft :size="14" />
        <span>折叠</span>
      </button>
    </div>

    <div class="outline-content">
      <div class="outline-group">
        <div class="group-title is-expanded">
          <ChevronDown :size="14" />
          <span>故事设定</span>
        </div>
        <div class="group-items">
          <div class="outline-item"><div class="item-dot"></div>世界观</div>
          <div class="outline-item"><div class="item-dot"></div>主线冲突</div>
          <div class="outline-item"><div class="item-dot"></div>基调</div>
        </div>
      </div>

      <div class="outline-group">
        <div class="group-title is-expanded">
          <ChevronDown :size="14" />
          <span>主要角色</span>
        </div>
        <div class="group-items">
          <div class="outline-item"><div class="item-dot"></div>林深</div>
          <div class="outline-item"><div class="item-dot"></div>苏瑶</div>
          <div class="outline-item"><div class="item-dot"></div>旧城守夜人</div>
        </div>
      </div>

      <div class="outline-group no-title">
        <div class="group-items">
          <div class="outline-item is-active"><div class="item-dot"></div>场景 1: 雾夜的信号</div>
          <div class="outline-item"><div class="item-dot"></div>场景 2: 旧城的追踪</div>
          <div class="outline-item"><div class="item-dot"></div>场景 3: 地下通信站</div>
          <div class="outline-item"><div class="item-dot"></div>场景 4: 真相的碎片</div>
          <div class="outline-item"><div class="item-dot"></div>场景 5: 最后的对决</div>
        </div>
      </div>
    </div>
  </aside>
</template>

<script setup lang="ts">
import { ChevronDown, ChevronLeft } from "lucide-vue-next";
import type { WorkbenchSnapshot } from "@airoaming/shared";

defineProps<{
  snapshot: WorkbenchSnapshot;
}>();
</script>

<style scoped>
.script-outline-panel {
  display: flex;
  flex-direction: column;
  background: rgba(13, 18, 33, 0.4);
  border: 1px solid rgba(255, 255, 255, 0.05);
  border-radius: 14px;
  overflow: hidden;
}

.outline-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 24px;
}

.outline-header h3 {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: #f1f5f9;
}

.collapse-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  background: transparent;
  border: none;
  color: #94a3b8;
  font-size: 12px;
  cursor: pointer;
}

.collapse-btn:hover {
  color: #e2e8f0;
}

.outline-content {
  flex: 1;
  overflow-y: auto;
  padding: 0 24px 24px;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.outline-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.outline-group.no-title {
  padding-top: 10px;
  border-top: 1px solid rgba(255, 255, 255, 0.05);
}

.group-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  font-weight: 600;
  color: #e2e8f0;
  cursor: pointer;
}

.group-title svg {
  color: #94a3b8;
}

.group-items {
  display: flex;
  flex-direction: column;
  padding-left: 10px;
  border-left: 1px solid rgba(255, 255, 255, 0.1);
  margin-left: 6px;
  gap: 8px;
}

.outline-item {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 13px;
  color: #94a3b8;
  cursor: pointer;
  padding: 6px 0 6px 12px;
  position: relative;
  transition: all 0.2s;
}

.outline-item:hover {
  color: #e2e8f0;
}

.item-dot {
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: #64748b;
  position: absolute;
  left: -2.5px;
}

.outline-item.is-active {
  color: #a78bfa;
  background: rgba(139, 92, 246, 0.1);
  border-radius: 4px;
}

.outline-item.is-active .item-dot {
  background: #a78bfa;
  box-shadow: 0 0 8px rgba(139, 92, 246, 0.8);
}
</style>
