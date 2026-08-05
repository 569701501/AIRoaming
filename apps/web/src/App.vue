<template>
  <RouterView v-if="isFullscreenRoute" />
  <AppShell v-else />
</template>

<script setup lang="ts">
import { computed, defineAsyncComponent, onMounted } from "vue";
import { useRoute } from "vue-router";
import { useSettingsStore } from "./stores/settings-store";

const AppShell = defineAsyncComponent(() => import("./components/layout/AppShell.vue"));
const route = useRoute();
const settings = useSettingsStore();
const isFullscreenRoute = computed(() => route.name === "layout-preview" || route.name === "document-detail");

onMounted(() => {
  if (!isFullscreenRoute.value) void settings.loadSettings();
});
</script>
