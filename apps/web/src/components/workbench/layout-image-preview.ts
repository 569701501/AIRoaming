import type { CSSProperties } from "vue";
import {
  evaluateCoverCropV1,
  type CoverCropV1,
} from "@airoaming/shared";

export interface LayoutImagePreviewStyleInputV1 {
  mode: "contain" | "cover";
  crop: CoverCropV1 | null;
  frameWidth: number;
  frameHeight: number;
  sourceWidth: number | null;
  sourceHeight: number | null;
  scale: number;
}

/**
 * Projects the persisted image display contract into CSS pixels.
 *
 * `scale` is a viewport-only value. It is intentionally applied at the final
 * projection boundary so crop zoom/offset stay in document coordinates and
 * never drift when DPR or the editor zoom changes.
 */
export function layoutImagePreviewStyleV1(
  input: LayoutImagePreviewStyleInputV1,
): CSSProperties {
  if (input.mode === "contain" || !input.crop) {
    return {
      position: "absolute",
      inset: "0",
      width: "100%",
      height: "100%",
      objectFit: "contain",
      transform: "none",
      transformOrigin: "center",
    };
  }

  const crop = input.crop;
  if (
    input.sourceWidth !== null
    && input.sourceHeight !== null
    && input.sourceWidth > 0
    && input.sourceHeight > 0
  ) {
    const evaluation = evaluateCoverCropV1({
      sourceWidth: input.sourceWidth,
      sourceHeight: input.sourceHeight,
      frameWidth: input.frameWidth,
      frameHeight: input.frameHeight,
      crop,
    });
    return {
      position: "absolute",
      left: `calc(50% + ${crop.offsetX * input.scale}px)`,
      top: `calc(50% + ${crop.offsetY * input.scale}px)`,
      width: `${input.sourceWidth * evaluation.baseScale * crop.zoom * input.scale}px`,
      height: `${input.sourceHeight * evaluation.baseScale * crop.zoom * input.scale}px`,
      maxWidth: "none",
      maxHeight: "none",
      objectFit: "fill",
      transform: `translate(-50%, -50%) rotate(${crop.rotation}deg) scale(${crop.flipX ? -1 : 1}, ${crop.flipY ? -1 : 1})`,
      transformOrigin: "center",
    };
  }

  // Never approximate a cover crop without verified source dimensions. The
  // image remains in the DOM so its intrinsic size can be captured on `load`,
  // but it is hidden until the caller can re-project it deterministically.
  return {
    position: "absolute",
    inset: "0",
    width: "100%",
    height: "100%",
    objectFit: "contain",
    visibility: "hidden",
  };
}
