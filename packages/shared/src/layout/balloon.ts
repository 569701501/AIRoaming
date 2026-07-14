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

function appendThoughtTail(path: string, width: number, height: number, tail: BalloonTailV1): string {
  if (!tail.enabled) return path;
  const rootX = Math.max(0, Math.min(width, width * tail.rootRatio));
  const rootY = height * 0.86;
  const dx = tail.targetX - rootX;
  const dy = tail.targetY - rootY;
  const firstRadius = Math.max(4, tail.baseWidth * 0.28);
  const secondRadius = Math.max(3, tail.baseWidth * 0.17);
  return `${path} ${circlePath(rootX + dx * 0.34, rootY + dy * 0.34, firstRadius)} ${circlePath(rootX + dx * 0.67, rootY + dy * 0.67, secondRadius)}`;
}

function appendTail(path: string, width: number, height: number, tail: BalloonTailV1): string {
  if (!tail.enabled) return path;
  const rootX = Math.max(0, Math.min(width, width * tail.rootRatio));
  const half = tail.baseWidth / 2;
  const body = path.slice(0, -1);
  return `${body} M${point(rootX - half, height * 0.92)} Q${point(rootX, height)} ${point(tail.targetX, tail.targetY)} Q${point(rootX, height)} ${point(rootX + half, height * 0.92)} Z`;
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
