<template>
  <Teleport to="body">
    <div v-if="open" class="characters-modal-backdrop" role="presentation" @click.self="$emit('close')">
      <section class="characters-modal-panel" role="dialog" aria-modal="true" aria-labelledby="characters-modal-title">
        <header class="characters-modal-header">
          <div>
            <span>项目资产</span>
            <h2 id="characters-modal-title">角色库</h2>
          </div>
          <button class="characters-modal-close" type="button" aria-label="关闭角色库" @click="$emit('close')">
            <X :size="18" />
          </button>
        </header>

        <ProjectCharactersWorkspace
          class="characters-modal-workspace"
          readonly
          :initial-view="initialView"
          :loading="loading"
          :snapshot="snapshot"
          :tasks="tasks"
        />
      </section>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { X } from "lucide-vue-next";
import type { GenerationTaskItem, UpdateProjectCharacterRequest, WorkbenchSnapshot } from "@airoaming/shared";
import ProjectCharactersWorkspace from "./ProjectCharactersWorkspace.vue";

defineProps<{
  open: boolean;
  snapshot: WorkbenchSnapshot;
  tasks: GenerationTaskItem[];
  loading: boolean;
  initialView?: "context" | "all";
}>();

defineEmits<{
  close: [];
  extractCharacters: [];
  ensurePreviews: [];
  regenerateReference: [payload: { characterId: string; referenceKind: "preview_front" | "final_reference"; input: UpdateProjectCharacterRequest }];
  deleteReference: [payload: { characterId: string; assetId: string }];
  confirmPreview: [payload: { characterId: string; assetId: string }];
  confirmReference: [payload: { characterId: string; assetId: string }];
}>();
</script>

<style scoped>
.characters-modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 70;
  display: grid;
  place-items: center;
  background: rgba(2, 6, 23, 0.72);
  backdrop-filter: blur(16px);
  padding: 22px;
}

.characters-modal-panel {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  gap: 12px;
  width: min(1240px, 96vw);
  height: min(860px, 92vh);
  min-height: 0;
  border: 1px solid rgba(139, 92, 246, 0.26);
  border-radius: 12px;
  background:
    linear-gradient(180deg, rgba(15, 23, 42, 0.96), rgba(7, 12, 24, 0.98)),
    #0f172a;
  box-shadow: 0 28px 90px rgba(0, 0, 0, 0.48);
  padding: 14px;
}

.characters-modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  border: 1px solid rgba(148, 163, 184, 0.14);
  border-radius: 8px;
  background: rgba(15, 23, 42, 0.62);
  padding: 12px 14px;
}

.characters-modal-header span {
  color: #8df0dc;
  font-size: 12px;
  font-weight: 900;
}

.characters-modal-header h2 {
  margin: 3px 0 0;
  color: #f8fbff;
  font-size: 20px;
}

.characters-modal-close {
  display: grid;
  width: 36px;
  height: 36px;
  place-items: center;
  border: 1px solid rgba(148, 163, 184, 0.18);
  border-radius: 8px;
  background: rgba(15, 23, 42, 0.76);
  color: #f8fbff;
}

.characters-modal-workspace {
  min-height: 0;
}

@media (max-width: 720px) {
  .characters-modal-backdrop {
    padding: 10px;
  }

  .characters-modal-panel {
    width: 100%;
    height: 96vh;
  }
}
</style>
