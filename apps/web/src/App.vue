<template>
  <RouterView v-if="isLayoutPreviewRoute" />
  <AppShell v-else />
</template>

<script setup lang="ts">
import { computed, defineAsyncComponent, onMounted } from "vue";
import { useRoute } from "vue-router";
import { useSettingsStore } from "./stores/settings-store";

const AppShell = defineAsyncComponent(() => import("./components/layout/AppShell.vue"));
const route = useRoute();
const settings = useSettingsStore();
const isLayoutPreviewRoute = computed(() => route.name === "layout-preview");

onMounted(() => {
  if (!isLayoutPreviewRoute.value) void settings.loadSettings();
});
</script>
