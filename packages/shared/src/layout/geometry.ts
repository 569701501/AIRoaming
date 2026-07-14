import type { CoverCropV1 } from "./document.js";

export class LayoutGeometryError extends Error {
  readonly code = "LAYOUT_GEOMETRY_INVALID" as const;

  constructor(message: string) {
    super(message);
    this.name = "LayoutGeometryError";
  }
}

function finite(value: number, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new LayoutGeometryError(`${label} must be finite`);
  return value;
}

export function normalizeLayoutNumber(value: number): number {
  finite(value, "layout number");
  const sign = value < 0 ? -1 : 1;
  const rounded = sign * Math.round((Math.abs(value) + Number.EPSILON) * 1_000) / 1_000;
  return Object.is(rounded, -0) ? 0 : rounded;
}

export function normalizeLayoutRotation(value: number): number {
  finite(value, "rotation");
  let normalized = ((value + 180) % 360 + 360) % 360 - 180;
  normalized = normalizeLayoutNumber(normalized);
  if (normalized >= 180) normalized = -180;
  return Object.is(normalized, -0) ? 0 : normalized;
}

function requiredScale(
  sourceWidth: number,
  sourceHeight: number,
  frameWidth: number,
  frameHeight: number,
  rotationDegrees: number,
  offsetX: number,
  offsetY: number,
): number {
  const radians = rotationDegrees * Math.PI / 180;
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  let scale = 0;
  for (const x of [-frameWidth / 2, frameWidth / 2]) {
    for (const y of [-frameHeight / 2, frameHeight / 2]) {
      const relativeX = x - offsetX;
      const relativeY = y - offsetY;
      const sourceX = relativeX * cosine + relativeY * sine;
      const sourceY = -relativeX * sine + relativeY * cosine;
      scale = Math.max(scale, Math.abs(sourceX) * 2 / sourceWidth, Math.abs(sourceY) * 2 / sourceHeight);
    }
  }
  return scale;
}

export interface EvaluateCoverCropInputV1 {
  sourceWidth: number;
  sourceHeight: number;
  frameWidth: number;
  frameHeight: number;
  crop: CoverCropV1;
}

export interface CoverCropEvaluationV1 {
  policyVersion: "layout_geometry_v1";
  baseScale: number;
  actualScale: number;
  requiredScaleWithOffset: number;
  covered: boolean;
}

export function evaluateCoverCropV1(input: EvaluateCoverCropInputV1): CoverCropEvaluationV1 {
  const sourceWidth = finite(input.sourceWidth, "sourceWidth");
  const sourceHeight = finite(input.sourceHeight, "sourceHeight");
  const frameWidth = finite(input.frameWidth, "frameWidth");
  const frameHeight = finite(input.frameHeight, "frameHeight");
  if (sourceWidth <= 0 || sourceHeight <= 0 || frameWidth <= 0 || frameHeight <= 0) {
    throw new LayoutGeometryError("source and frame dimensions must be greater than zero");
  }
  if (input.crop.zoom < 1 || !Number.isFinite(input.crop.zoom)) throw new LayoutGeometryError("crop zoom must be >= 1");
  const rotation = normalizeLayoutRotation(input.crop.rotation);
  const baseScaleRaw = requiredScale(sourceWidth, sourceHeight, frameWidth, frameHeight, rotation, 0, 0);
  const requiredWithOffsetRaw = requiredScale(
    sourceWidth,
    sourceHeight,
    frameWidth,
    frameHeight,
    rotation,
    finite(input.crop.offsetX, "offsetX"),
    finite(input.crop.offsetY, "offsetY"),
  );
  const actualScaleRaw = baseScaleRaw * input.crop.zoom;
  return {
    policyVersion: "layout_geometry_v1",
    baseScale: normalizeLayoutNumber(baseScaleRaw),
    actualScale: normalizeLayoutNumber(actualScaleRaw),
    requiredScaleWithOffset: normalizeLayoutNumber(requiredWithOffsetRaw),
    covered: actualScaleRaw + 1e-9 >= requiredWithOffsetRaw,
  };
}
