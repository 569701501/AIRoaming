import {
  LayoutDocumentCodecV1,
  digestCandidateImageSourceV1,
  digestLayoutSourceLockSet,
  type LayoutDigest,
  type LayoutDocumentV1,
  type PanelFrameElementV1,
} from "@airoaming/shared";

interface LegacyReadySourceV1 {
  elementId: string;
  shotId: string;
  candidateId: string;
  candidateLockRevisionId: string;
  assetId: string;
  assetSha256: LayoutDigest;
  width: number;
  height: number;
}

interface LegacyConverterInputV1 {
  projectId: string;
  chapterId: string;
  comicFormat: "vertical_scroll" | "paged_comic";
  fontAssetId: string;
  legacyDocument: unknown;
  sources: LegacyReadySourceV1[];
}

interface LegacyConverterResultV1 {
  document: LayoutDocumentV1;
  documentDigest: LayoutDigest;
  sourceLockSetDigest: LayoutDigest;
}

function fail(code: string): never {
  throw new Error(code);
}

function record(value: unknown, code = "LEGACY_LAYOUT_INVALID"): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(code);
  return value as Record<string, unknown>;
}

function number(value: unknown, code: string, minimum = 0): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < minimum) fail(code);
  return value;
}

function dimension(value: unknown): number {
  const result = number(value, "LEGACY_LAYOUT_DIMENSION_INVALID", 1);
  if (result > 16_384) fail("LEGACY_LAYOUT_DIMENSION_INVALID");
  return result;
}

/**
 * 把有完整来源证据的旧 ChapterLayout 转成正式 LayoutDocument V1。
 * 本函数不猜来源：placement 数量、Asset sha 或当前锁证据不完整时直接拒绝。
 */
export function convertLegacyChapterLayoutV1(input: LegacyConverterInputV1): LegacyConverterResultV1 {
  const legacy = record(input.legacyDocument);
  if (!Array.isArray(legacy.pages) || legacy.pages.length < 1 || legacy.pages.length > 500) {
    fail("LEGACY_LAYOUT_PAGES_INVALID");
  }
  const pages = legacy.pages.map((value) => record(value));
  const placementCount = pages.reduce((total, page) => {
    if (!Array.isArray(page.placements)) fail("LEGACY_LAYOUT_PLACEMENTS_INVALID");
    return total + page.placements.length;
  }, 0);
  if (placementCount !== input.sources.length || placementCount < 1) {
    fail("LEGACY_LAYOUT_SOURCE_COUNT_MISMATCH");
  }
  const firstWidth = dimension(pages[0]!.width);
  const firstHeight = dimension(pages[0]!.height);
  if (input.comicFormat === "paged_comic" && pages.some((page) => dimension(page.width) !== firstWidth || dimension(page.height) !== firstHeight)) {
    fail("LEGACY_LAYOUT_PAGE_PROFILE_MISMATCH");
  }
  if (input.comicFormat === "vertical_scroll" && pages.some((page) => dimension(page.width) !== firstWidth)) {
    fail("LEGACY_LAYOUT_STRIP_WIDTH_MISMATCH");
  }

  let sourceIndex = 0;
  const canvases = pages.map((page, pageIndex) => {
    const width = dimension(page.width);
    const height = dimension(page.height);
    // 旧来源绑定按旧 placement 的原始顺序建立，排序只改变阅读顺序，不能把来源错配给别的画格。
    const placements = (page.placements as unknown[])
      .map((value, originalIndex) => ({
        row: record(value),
        originalIndex,
        source: input.sources[sourceIndex++],
      }))
      .sort((left, right) => {
        const leftOrder = typeof left.row.order === "number" ? left.row.order : left.originalIndex + 1;
        const rightOrder = typeof right.row.order === "number" ? right.row.order : right.originalIndex + 1;
        return leftOrder - rightOrder || left.originalIndex - right.originalIndex;
      });
    const panels: PanelFrameElementV1[] = placements.map(({ row, source }, placementIndex) => {
      if (!source || !/^sha256:[0-9a-f]{64}$/.test(source.assetSha256)) fail("LEGACY_LAYOUT_SOURCE_INVALID");
      const unsigned = {
        shotId: source.shotId,
        candidateId: source.candidateId,
        candidateLockRevisionId: source.candidateLockRevisionId,
        assetId: source.assetId,
      };
      const suffix = `${String(pageIndex + 1).padStart(3, "0")}_${String(placementIndex + 1).padStart(3, "0")}`;
      return {
        id: `legacy_panel_${suffix}`,
        type: "panel_frame",
        name: `旧排版画格 ${pageIndex + 1}-${placementIndex + 1}`,
        transform: {
          x: number(row.x, "LEGACY_LAYOUT_GEOMETRY_INVALID"),
          y: number(row.y, "LEGACY_LAYOUT_GEOMETRY_INVALID"),
          width: dimension(row.w),
          height: dimension(row.h),
          rotation: 0,
          opacity: 1,
        },
        locked: false,
        hidden: false,
        shape: { kind: "rect", cornerRadius: 0 },
        border: { visible: true, color: "#111827FF", width: 2 },
        contentImage: {
          id: `legacy_image_${suffix}`,
          type: "image",
          placement: "panel_content",
          name: `旧排版来源 ${source.elementId}`,
          locked: false,
          hidden: false,
          source: {
            ...unsigned,
            sourceDigest: digestCandidateImageSourceV1(unsigned, source.assetSha256),
          },
          crop: { zoom: 1, offsetX: 0, offsetY: 0, rotation: 0, flipX: false, flipY: false },
        },
      };
    });
    return {
      id: `legacy_canvas_${String(pageIndex + 1).padStart(3, "0")}`,
      kind: input.comicFormat === "paged_comic" ? "page" as const : "strip_section" as const,
      name: input.comicFormat === "paged_comic" ? `第 ${pageIndex + 1} 页` : `第 ${pageIndex + 1} 段`,
      width,
      height,
      backgroundColor: "#FFFFFFFF" as const,
      panelReadingOrder: panels.map((panel) => panel.id),
      elements: panels,
    };
  });
  const document: LayoutDocumentV1 = {
    schemaVersion: 1,
    kind: "layout_document_v1",
    projectId: input.projectId,
    chapterId: input.chapterId,
    comicFormat: input.comicFormat,
    profile: input.comicFormat === "paged_comic"
      ? {
          kind: "paged",
          presetId: firstWidth === 1800 && firstHeight === 2400 ? "portrait_3_4" : "custom",
          width: firstWidth,
          height: firstHeight,
          safeArea: { top: 0, right: 0, bottom: 0, left: 0 },
          panelReadingDirection: "ltr_ttb",
        }
      : {
          kind: "vertical_strip",
          presetId: firstWidth === 1080 ? "webtoon_1080" : "custom",
          width: firstWidth,
          defaultSectionHeight: firstHeight,
          safeInsetX: 0,
        },
    fontPolicy: { defaultFontAssetId: input.fontAssetId, fallbackFontAssetIds: [] },
    canvases,
  };
  const encoded = LayoutDocumentCodecV1.encode(document, {
    projectId: input.projectId,
    chapterId: input.chapterId,
    comicFormat: input.comicFormat,
  });
  const activeShotIds = [...new Set(input.sources.map((source) => source.shotId))];
  const sourceLockSetDigest = digestLayoutSourceLockSet(encoded.value, activeShotIds);
  if (!sourceLockSetDigest) fail("LEGACY_LAYOUT_SOURCE_DIGEST_MISSING");
  return {
    document: encoded.value,
    documentDigest: encoded.digest,
    sourceLockSetDigest,
  };
}
