import type { LayoutDocumentV1, LayoutTransformV1 } from "./document.js";

export interface LayoutVisibleShotPlacementV1 {
  canvasId: string;
  elementId: string;
  role: "panel_content" | "free_image";
}

export type LayoutVisibleShotPlacementMapV1 = Record<string, LayoutVisibleShotPlacementV1[]>;

function intersectsCanvas(
  transform: LayoutTransformV1,
  canvasWidth: number,
  canvasHeight: number,
): boolean {
  if (
    transform.opacity <= 0
    || transform.width <= 0
    || transform.height <= 0
  ) return false;
  const radians = transform.rotation * Math.PI / 180;
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  const centerX = transform.x + transform.width / 2;
  const centerY = transform.y + transform.height / 2;
  const corners = [
    [-transform.width / 2, -transform.height / 2],
    [transform.width / 2, -transform.height / 2],
    [transform.width / 2, transform.height / 2],
    [-transform.width / 2, transform.height / 2],
  ].map(([x, y]) => ({
    x: centerX + x! * cosine - y! * sine,
    y: centerY + x! * sine + y! * cosine,
  }));
  const minX = Math.min(...corners.map((corner) => corner.x));
  const maxX = Math.max(...corners.map((corner) => corner.x));
  const minY = Math.min(...corners.map((corner) => corner.y));
  const maxY = Math.max(...corners.map((corner) => corner.y));
  return maxX > 0 && maxY > 0 && minX < canvasWidth && minY < canvasHeight;
}

export function projectVisibleShotPlacementsV1(
  document: LayoutDocumentV1,
): LayoutVisibleShotPlacementMapV1 {
  const result: LayoutVisibleShotPlacementMapV1 = {};
  for (const canvas of document.canvases) {
    for (const element of canvas.elements) {
      if (
        element.hidden
        || !intersectsCanvas(element.transform, canvas.width, canvas.height)
      ) continue;
      const image = element.type === "panel_frame" ? element.contentImage : null;
      const source = element.type === "free_image"
        ? element.source
        : image && !image.hidden
          ? image.source
          : null;
      if (!source) continue;
      (result[source.shotId] ??= []).push({
        canvasId: canvas.id,
        elementId: element.id,
        role: element.type === "free_image" ? "free_image" : "panel_content",
      });
    }
  }
  return result;
}
