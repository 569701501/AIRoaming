import type { BalloonElementV1, BalloonTailV1 } from "./document.js";
import { normalizeLayoutNumber } from "./geometry.js";

function point(x: number, y: number): string {
  return `${normalizeLayoutNumber(x)} ${normalizeLayoutNumber(y)}`;
}

function ellipsePath(width: number, height: number): string {
  const cx = width / 2;
  const cy = height / 2;
  return `M${point(cx, 0)} C${point(width * 0.776, 0)} ${point(width, height * 0.224)} ${point(width, cy)} C${point(width, height * 0.776)} ${point(width * 0.776, height)} ${point(cx, height)} C${point(width * 0.224, height)} ${point(0, height * 0.776)} ${point(0, cy)} C${point(0, height * 0.224)} ${point(width * 0.224, 0)} ${point(cx, 0)} Z`;
}

function captionPath(width: number, height: number): string {
  const radius = Math.min(width, height) * 0.08;
  return `M${point(radius, 0)} L${point(width - radius, 0)} Q${point(width, 0)} ${point(width, radius)} L${point(width, height - radius)} Q${point(width, height)} ${point(width - radius, height)} L${point(radius, height)} Q${point(0, height)} ${point(0, height - radius)} L${point(0, radius)} Q${point(0, 0)} ${point(radius, 0)} Z`;
}

function radialPath(width: number, height: number, points: number, alternating: number): string {
  const cx = width / 2;
  const cy = height / 2;
  const values: string[] = [];
  for (let index = 0; index < points; index += 1) {
    const angle = -Math.PI / 2 + index * Math.PI * 2 / points;
    const factor = index % 2 === 0 ? 1 : alternating;
    values.push(point(cx + Math.cos(angle) * cx * factor, cy + Math.sin(angle) * cy * factor));
  }
  return `M${values.join(" L")} Z`;
}

function cloudPath(width: number, height: number): string {
  const cx = width / 2;
  const cy = height / 2;
  const points = Array.from({ length: 12 }, (_, index) => {
    const angle = -Math.PI / 2 + index * Math.PI * 2 / 12;
    return { x: cx + Math.cos(angle) * cx * 0.92, y: cy + Math.sin(angle) * cy * 0.9, angle };
  });
  let path = `M${point(points[0]!.x, points[0]!.y)}`;
  for (let index = 0; index < points.length; index += 1) {
    const next = points[(index + 1) % points.length]!;
    const midAngle = points[index]!.angle + Math.PI / 12;
    const controlX = cx + Math.cos(midAngle) * cx * 1.08;
    const controlY = cy + Math.sin(midAngle) * cy * 1.06;
    path += ` Q${point(controlX, controlY)} ${point(next.x, next.y)}`;
  }
  return `${path} Z`;
}

function circlePath(cx: number, cy: number, radius: number): string {
  return `M${point(cx + radius, cy)} A${point(radius, radius)} 0 1 0 ${point(cx - radius, cy)} A${point(radius, radius)} 0 1 0 ${point(cx + radius, cy)} Z`;
}

export type BalloonTailSideV1 = "top" | "right" | "bottom" | "left";

export interface BalloonTailRootV1 {
  x: number;
  y: number;
  side: BalloonTailSideV1;
}

function tailSide(width: number, height: number, targetX: number, targetY: number): BalloonTailSideV1 {
  // Pick the edge that faces the target from the balloon centre. Comparing the
  // normalised direction avoids a diagonal target above-left being attached to
  // the left edge merely because it is a few pixels closer to that boundary.
  const horizontal = (targetX - width / 2) / Math.max(1, width / 2);
  const vertical = (targetY - height / 2) / Math.max(1, height / 2);
  if (Math.abs(horizontal) > Math.abs(vertical)) return horizontal < 0 ? "left" : "right";
  return vertical < 0 ? "top" : "bottom";
}

export function balloonTailRootRatioForTargetV1(input: {
  width: number;
  height: number;
  targetX: number;
  targetY: number;
}): number {
  const side = tailSide(input.width, input.height, input.targetX, input.targetY);
  const ratio = side === "left" || side === "right"
    ? input.targetY / input.height
    : input.targetX / input.width;
  return normalizeLayoutNumber(Math.max(0.12, Math.min(0.87, ratio)));
}

export function resolveBalloonTailRootV1(
  width: number,
  height: number,
  tail: BalloonTailV1,
): BalloonTailRootV1 {
  const side = tailSide(width, height, tail.targetX, tail.targetY);
  const ratio = Math.max(0.08, Math.min(0.92, tail.rootRatio));
  if (side === "top") return { x: width * ratio, y: height * 0.08, side };
  if (side === "bottom") return { x: width * ratio, y: height * 0.92, side };
  if (side === "left") return { x: width * 0.08, y: height * ratio, side };
  return { x: width * 0.92, y: height * ratio, side };
}

function appendThoughtTail(path: string, width: number, height: number, tail: BalloonTailV1): string {
  if (!tail.enabled) return path;
  const root = resolveBalloonTailRootV1(width, height, tail);
  const dx = tail.targetX - root.x;
  const dy = tail.targetY - root.y;
  const firstRadius = Math.max(4, tail.baseWidth * 0.28);
  const secondRadius = Math.max(3, tail.baseWidth * 0.17);
  return `${path} ${circlePath(root.x + dx * 0.34, root.y + dy * 0.34, firstRadius)} ${circlePath(root.x + dx * 0.67, root.y + dy * 0.67, secondRadius)}`;
}

function appendTail(path: string, width: number, height: number, tail: BalloonTailV1): string {
  if (!tail.enabled) return path;
  const root = resolveBalloonTailRootV1(width, height, tail);
  const half = tail.baseWidth / 2;
  if (root.side === "top") {
    return `${path} M${point(root.x - half, root.y)} Q${point(root.x, 0)} ${point(tail.targetX, tail.targetY)} Q${point(root.x, 0)} ${point(root.x + half, root.y)} Z`;
  }
  if (root.side === "bottom") {
    return `${path} M${point(root.x - half, root.y)} Q${point(root.x, height)} ${point(tail.targetX, tail.targetY)} Q${point(root.x, height)} ${point(root.x + half, root.y)} Z`;
  }
  if (root.side === "left") {
    return `${path} M${point(root.x, root.y - half)} Q${point(0, root.y)} ${point(tail.targetX, tail.targetY)} Q${point(0, root.y)} ${point(root.x, root.y + half)} Z`;
  }
  return `${path} M${point(root.x, root.y - half)} Q${point(width, root.y)} ${point(tail.targetX, tail.targetY)} Q${point(width, root.y)} ${point(root.x, root.y + half)} Z`;
}

export interface BalloonPathInputV1 {
  kind: BalloonElementV1["balloonKind"];
  width: number;
  height: number;
  tail: BalloonTailV1;
}

export function createBalloonPathV1(input: BalloonPathInputV1): string {
  if (!Number.isFinite(input.width) || !Number.isFinite(input.height) || input.width <= 0 || input.height <= 0) {
    throw new Error("balloon dimensions must be greater than zero");
  }
  if (input.kind === "caption") return captionPath(input.width, input.height);
  if (input.kind === "thought") return appendThoughtTail(cloudPath(input.width, input.height), input.width, input.height, input.tail);
  const body = input.kind === "speech" ? ellipsePath(input.width, input.height) : radialPath(input.width, input.height, 24, 0.68);
  return appendTail(body, input.width, input.height, input.tail);
}
