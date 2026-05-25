<template>
  <main class="project-library">
    <ProjectCommandPanel
      :completed-tasks="workbench.completedTaskCount"
      :loading="loading"
      :running-tasks="workbench.runningTaskCount"
      @create="isCreateOpen = true"
      @refresh="refresh"
    />

    <WorkflowStrip />

    <section class="project-list-section" aria-label="项目列表">
      <div class="project-section-header">
        <div class="filter-tabs" role="tablist" aria-label="项目状态筛选">
          <button
            v-for="filter in filters"
            :key="filter.key"
            type="button"
            :class="{ 'is-active': selectedFilter === filter.key }"
            @click="selectedFilter = filter.key"
          >
            {{ filter.label }}
          </button>
        </div>
        <div class="sort-controls">
          <span class="sort-label">排序: 最近编辑</span>
          <ChevronDown :size="14" class="sort-chevron" />
          <div class="view-toggles">
            <button type="button" class="view-btn is-active" aria-label="网格视图"><LayoutGrid :size="16" /></button>
            <button type="button" class="view-btn" aria-label="列表视图"><List :size="16" /></button>
          </div>
        </div>
      </div>

      <div v-if="error" class="notice-card is-error">
        <strong>项目服务连接失败</strong>
        <span>{{ error }}</span>
        <button type="button" @click="refresh">重新连接</button>
      </div>

      <div v-else-if="filteredProjects.length" class="project-grid">
        <ProjectCard
          v-for="project in filteredProjects"
          :key="project.id"
          :active="project.id === activeProjectId"
          :project="project"
          @delete="requestDeleteProject"
          @open="openProject"
        />
      </div>

      <div v-else class="empty-state">
        <div class="empty-icon">
          <FolderPlus :size="25" />
        </div>
        <strong>{{ projects.length ? "没有匹配项目" : "项目为空，请创建项目" }}</strong>
        <p v-if="projects.length">请调整搜索或筛选条件。</p>
      </div>
    </section>

    <CreateProjectModal :loading="loading" :open="isCreateOpen" @close="isCreateOpen = false" @create="createProject" />
    <DeleteProjectDialog
      :loading="loading"
      :open="Boolean(projectPendingDelete)"
      :project-name="projectPendingDelete?.name ?? ''"
      @close="projectPendingDelete = null"
      @confirm="confirmDeleteProject"
    />
  </main>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { storeToRefs } from "pinia";
import { ChevronDown, FolderPlus, LayoutGrid, List } from "lucide-vue-next";
import type { CreateProjectRequest, ProjectListItem, ProjectStatus } from "@airoaming/shared";
import CreateProjectModal from "./CreateProjectModal.vue";
import DeleteProjectDialog from "./DeleteProjectDialog.vue";
import ProjectCard from "./ProjectCard.vue";
import ProjectCommandPanel from "./ProjectCommandPanel.vue";
import WorkflowStrip from "./WorkflowStrip.vue";
import { useWorkbenchStore } from "../../stores/workbench-store";

const props = defineProps<{
  searchQuery: string;
}>();

const workbench = useWorkbenchStore();
const { activeProjectId, error, loading, projects } = storeToRefs(workbench);

const isCreateOpen = ref(false);
const projectPendingDelete = ref<ProjectListItem | null>(null);
const selectedFilter = ref<ProjectStatus | "all">("all");

const filters: Array<{ key: ProjectStatus | "all"; label: string }> = [
  { key: "all", label: "全部" },
  { key: "draft", label: "进行中" },
  { key: "story_ready", label: "草稿" },
  { key: "exported", label: "已完成" },
];

const normalizedSearch = computed(() => props.searchQuery.trim().toLowerCase());

const filteredProjects = computed(() => {
  return projects.value.filter((project) => {
    const matchedStatus = selectedFilter.value === "all" || project.status === selectedFilter.value;
    const searchable = [project.name, project.description, project.sourceTextPreview].join(" ").toLowerCase();
    const matchedSearch = !normalizedSearch.value || searchable.includes(normalizedSearch.value);
    return matchedStatus && matchedSearch;
  });
});

onMounted(() => {
  void refresh();
});

async function refresh() {
  await workbench.refresh();
}

async function createProject(input: CreateProjectRequest) {
  await workbench.createProject(input);
  if (!workbench.error) {
    isCreateOpen.value = false;
  }
}

async function openProject(projectId: string) {
  await workbench.openProject(projectId);
}

function requestDeleteProject(project: ProjectListItem) {
  projectPendingDelete.value = project;
}

async function confirmDeleteProject() {
  const project = projectPendingDelete.value;
  if (!project) {
    return;
  }

  await workbench.deleteProject(project.id);
  if (!workbench.error) {
    projectPendingDelete.value = null;
  }
}
</script>
