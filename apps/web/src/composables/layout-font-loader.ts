import { onBeforeUnmount, ref, watch, type Ref } from "vue";
import { layoutFontFamilyNameV1, type LayoutFontCatalogResponseV1 } from "@airoaming/shared";

import { api } from "../services/api";

export function useLayoutFontLoader(input: {
  projectId: Ref<string>;
  chapterId: Ref<string | null>;
  catalog: Ref<LayoutFontCatalogResponseV1 | null>;
}) {
  const loadError = ref<string | null>(null);
  const loadedShaByAssetId = new Map<string, string>();
  const loadedFaces = new Map<string, FontFace>();

  async function synchronize(): Promise<void> {
    if (typeof FontFace === "undefined" || !input.chapterId.value || !input.catalog.value) return;
    loadError.value = null;
    for (const item of input.catalog.value.items) {
      if (loadedShaByAssetId.get(item.assetId) === item.sha256) continue;
      const previous = loadedFaces.get(item.assetId);
      if (previous) document.fonts.delete(previous);
      const source = `url("${api.layoutFontFileUrl(input.projectId.value, input.chapterId.value, item.assetId)}") format("${item.metadata.format}")`;
      const face = new FontFace(layoutFontFamilyNameV1(item.assetId), source, {
        weight: String(item.metadata.face.weight),
        style: item.metadata.face.style,
        display: "block",
      });
      try {
        await face.load();
        document.fonts.add(face);
        loadedFaces.set(item.assetId, face);
        loadedShaByAssetId.set(item.assetId, item.sha256);
      } catch {
        loadError.value = `受控字体 ${item.metadata.displayName} 加载失败`;
        return;
      }
    }
  }

  watch(
    [input.projectId, input.chapterId, input.catalog],
    () => void synchronize(),
    { immediate: true },
  );

  onBeforeUnmount(() => {
    for (const face of loadedFaces.values()) document.fonts.delete(face);
    loadedFaces.clear();
    loadedShaByAssetId.clear();
  });

  return { loadError, synchronize };
}
