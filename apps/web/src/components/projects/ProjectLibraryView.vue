<template>
  <main class="project-library">
    <ProjectCommandPanel
      :projects="projects"
      @create="isCreateOpen = true"
    />

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
            {{ filter.label }} <span class="filter-count">{{ filter.count }}</span>
          </button>
        </div>
        <div class="sort-controls">
          <span class="sort-label">最近编辑</span>
          <ChevronDown :size="14" class="sort-chevron" />
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
          @open="openProject"
          @request-delete="requestDeleteProject"
        />
      </div>

      <div v-else class="empty-state">
        <div class="empty-icon">
          <FolderPlus :size="25" />
        </div>
        <strong>{{ projects.length ? "没有匹配项目" : "项目为空，请创建项目" }}</strong>
        <p v-if="projects.length">请调整筛选条件。</p>
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
import { useRouter } from "vue-router";
import { ChevronDown, FolderPlus } from "lucide-vue-next";
import type { CreateProjectRequest, ProjectListItem, ProjectStatus } from "@airoaming/shared";
import CreateProjectModal from "./CreateProjectModal.vue";
import DeleteProjectDialog from "./DeleteProjectDialog.vue";
import ProjectCard from "./ProjectCard.vue";
import ProjectCommandPanel from "./ProjectCommandPanel.vue";
import { projectRoute } from "../../router";
import { useWorkbenchStore } from "../../stores/workbench-store";

const workbench = useWorkbenchStore();
const router = useRouter();
const { activeProjectId, error, loading, projects } = storeToRefs(workbench);

const isCreateOpen = ref(false);
const projectPendingDelete = ref<ProjectListItem | null>(null);

type FilterKey = "all" | "creating" | "exported";

const selectedFilter = ref<FilterKey>("all");

const filters = computed(() => [
  { key: "all" as const, label: "全部", count: projects.value.length },
  {
    key: "creating" as const,
    label: "创作中",
    count: projects.value.filter((p) => p.status !== "exported").length,
  },
  {
    key: "exported" as const,
    label: "已导出",
    count: projects.value.filter((p) => p.status === "exported").length,
  },
]);

function matchesFilter(project: ProjectListItem): boolean {
  if (selectedFilter.value === "all") {
    return true;
  }
  if (selectedFilter.value === "exported") {
    return project.status === "exported";
  }
  return project.status !== "exported";
}

const filteredProjects = computed(() => projects.value.filter(matchesFilter));

onMounted(() => {
  void refresh();
});

async function refresh() {
  await workbench.refresh();
}

async function createProject(input: CreateProjectRequest) {
  const project = await workbench.createProject(input);
  if (project && !workbench.error) {
    isCreateOpen.value = false;
    await router.push(projectRoute(project.id));
  }
}

async function openProject(projectId: string) {
  await router.push(projectRoute(projectId));
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
  if (!workbench.projects.some((item) => item.id === project.id)) {
    projectPendingDelete.value = null;
  }
}
</script>
