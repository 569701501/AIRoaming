<template>
  <AppShell />
</template>

<script setup lang="ts">
import { onMounted } from "vue";
import AppShell from "./components/layout/AppShell.vue";
import { useSettingsStore } from "./stores/settings-store";

const settings = useSettingsStore();

onMounted(() => {
  void settings.loadSettings();
});
</script>
