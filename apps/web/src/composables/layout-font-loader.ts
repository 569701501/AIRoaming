import { onBeforeUnmount, ref, watch, type Ref } from "vue";
import { layoutFontFamilyNameV1, type LayoutFontCatalogResponseV1 } from "@airoaming/shared";

import { api } from "../services/api";

export type LayoutFontLoadState = "loading" | "ready" | "error";

export function useLayoutFontLoader(input: {
  projectId: Ref<string>;
  chapterId: Ref<string | null>;
  catalog: Ref<LayoutFontCatalogResponseV1 | null>;
}) {
  const loadError = ref<string | null>(null);
  const loadState = ref<LayoutFontLoadState>("loading");
  const loadedShaByAssetId = new Map<string, string>();
  const loadedFaces = new Map<string, FontFace>();
  let loadGeneration = 0;

  async function synchronize(): Promise<void> {
    loadGeneration += 1;
    const generation = loadGeneration;
    loadError.value = null;
    loadState.value = "loading";
    if (!input.chapterId.value || !input.catalog.value) return;
    if (typeof FontFace === "undefined" || !document.fonts) {
      loadError.value = "当前浏览器不支持受控字体加载";
      loadState.value = "error";
      return;
    }
    for (const item of input.catalog.value.items) {
      if (loadedShaByAssetId.get(item.assetId) === item.sha256) continue;
      const previous = loadedFaces.get(item.assetId);
      if (previous) {
        document.fonts.delete(previous);
        loadedFaces.delete(item.assetId);
        loadedShaByAssetId.delete(item.assetId);
      }
      const source = `url("${api.layoutFontFileUrl(input.projectId.value, input.chapterId.value, item.assetId)}") format("${item.metadata.format}")`;
      const face = new FontFace(layoutFontFamilyNameV1(item.assetId), source, {
        weight: String(item.metadata.face.weight),
        style: item.metadata.face.style,
        display: "block",
      });
      try {
        await face.load();
        if (generation !== loadGeneration) return;
        document.fonts.add(face);
        loadedFaces.set(item.assetId, face);
        loadedShaByAssetId.set(item.assetId, item.sha256);
      } catch {
        if (generation !== loadGeneration) return;
        loadError.value = `受控字体 ${item.metadata.displayName} 加载失败`;
        loadState.value = "error";
        return;
      }
    }
    if (generation === loadGeneration) loadState.value = "ready";
  }

  watch(
    [input.projectId, input.chapterId, input.catalog],
    () => void synchronize(),
    { immediate: true },
  );

  onBeforeUnmount(() => {
    loadGeneration += 1;
    for (const face of loadedFaces.values()) document.fonts.delete(face);
    loadedFaces.clear();
    loadedShaByAssetId.clear();
  });

  return { loadError, loadState, synchronize };
}
