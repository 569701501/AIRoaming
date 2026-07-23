import type {
  InitializeLayoutWorkingCopyResponseV1,
  ProjectListItem,
} from "@airoaming/shared";

import type { E2EApiClient } from "./e2e-fixture.ts";

export async function initializeLegacyLayoutWorkingCopy(
  api: E2EApiClient,
  project: Pick<ProjectListItem, "comicFormat">,
  projectId: string,
  chapterId: string,
): Promise<InitializeLayoutWorkingCopyResponseV1> {
  const profile = project.comicFormat === "paged_comic"
    ? {
        kind: "paged" as const,
        presetId: "portrait_3_4" as const,
        width: 1800,
        height: 2400,
        safeArea: { top: 72, right: 72, bottom: 72, left: 72 },
        panelReadingDirection: "ltr_ttb" as const,
      }
    : {
        kind: "vertical_strip" as const,
        presetId: "webtoon_1080" as const,
        width: 1080,
        defaultSectionHeight: 1920,
        safeInsetX: 64,
      };
  return (await api.post<InitializeLayoutWorkingCopyResponseV1>(
    `/projects/${projectId}/chapters/${chapterId}/layout/working-copy/initialize`,
    {
      schemaVersion: 1,
      profile,
      initializationMode: "default_storyboard_layout",
      expectedCurrentLayoutRevisionId: null,
    },
  )).data;
}
