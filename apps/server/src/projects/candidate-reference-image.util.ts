import { createHash } from "node:crypto";
import * as path from "node:path";
import sharp from "sharp";

export const CAST_IDENTITY_BOARD_LAYOUT_VERSION = "cast_identity_board_v1" as const;
export const CAST_IDENTITY_BOARD_MAX_CHARACTERS = 12;

const CELL_WIDTH = 640;
const CELL_HEIGHT = 896;
const GAP = 24;
const BACKGROUND = { r: 244, g: 244, b: 244, alpha: 1 } as const;

export type CandidateCharacterReferenceKind = "preview_front" | "final_reference";

export interface CandidateImageInspection {
  width: number;
  height: number;
  mimeType: "image/png" | "image/jpeg" | "image/webp";
}

export interface PreparedCandidateIdentityImage {
  sourceAssetId: string;
  label: string;
  buffer: Buffer;
  mimeType: "image/png" | "image/jpeg" | "image/webp";
  fileName: string;
  sourceWidth: number;
  sourceHeight: number;
  width: number;
  height: number;
}

export interface CastIdentityBoardEvidence {
  kind: "cast_identity_board";
  version: typeof CAST_IDENTITY_BOARD_LAYOUT_VERSION;
  sha256: `sha256:${string}`;
  width: number;
  height: number;
  columns: number;
  rows: number;
  cellWidth: number;
  cellHeight: number;
  gap: number;
  sources: Array<{
    sourceAssetId: string;
    label: string;
    order: number;
    sourceWidth: number;
    sourceHeight: number;
    preparedWidth: number;
    preparedHeight: number;
    cell: { x: number; y: number; width: number; height: number };
  }>;
}

export interface CastIdentityBoardResult {
  buffer: Buffer;
  mimeType: "image/webp";
  fileName: string;
  evidence: CastIdentityBoardEvidence;
}

export async function inspectCandidateImage(buffer: Buffer): Promise<CandidateImageInspection> {
  if (buffer.length === 0) throw new TypeError("image buffer must be non-empty");
  const image = sharp(buffer, { failOn: "error" });
  const metadata = await image.metadata();
  const mimeType = toSupportedMimeType(metadata.format);
  if (!mimeType || !metadata.width || !metadata.height) {
    throw new TypeError("image must be a decodable PNG, JPEG or WebP");
  }
  // metadata() can succeed for a truncated file. Force one decoded pixel before any
  // external provider request so corrupt required references fail closed locally.
  await image.clone().resize({ width: 1, height: 1, fit: "inside" }).toBuffer();
  return { width: metadata.width, height: metadata.height, mimeType };
}

export async function prepareCandidateIdentityImage(input: {
  assetId: string;
  label: string;
  buffer: Buffer;
  fileName: string;
}): Promise<PreparedCandidateIdentityImage> {
  const inspection = await inspectCandidateImage(input.buffer);
  return {
    sourceAssetId: input.assetId,
    label: input.label,
    buffer: input.buffer,
    mimeType: inspection.mimeType,
    fileName: normalizeFileName(input.fileName, inspection.mimeType),
    sourceWidth: inspection.width,
    sourceHeight: inspection.height,
    width: inspection.width,
    height: inspection.height,
  };
}

export async function buildCastIdentityBoard(
  identities: readonly PreparedCandidateIdentityImage[],
): Promise<CastIdentityBoardResult> {
  if (identities.length < 2) throw new TypeError("cast identity board requires at least two characters");
  if (identities.length > CAST_IDENTITY_BOARD_MAX_CHARACTERS) {
    throw new RangeError(
      `cast identity board supports at most ${CAST_IDENTITY_BOARD_MAX_CHARACTERS} characters`,
    );
  }

  const { columns, rows } = boardGrid(identities.length);
  const width = GAP + columns * (CELL_WIDTH + GAP);
  const height = GAP + rows * (CELL_HEIGHT + GAP);
  const cells = await Promise.all(identities.map(async (identity, index) => {
    const data = await sharp(identity.buffer, { failOn: "error" })
      .resize(CELL_WIDTH, CELL_HEIGHT, {
        fit: "contain",
        position: "centre",
        background: BACKGROUND,
      })
      .flatten({ background: BACKGROUND })
      .webp({ quality: 95, effort: 4 })
      .toBuffer();
    const column = index % columns;
    const row = Math.floor(index / columns);
    return {
      input: data,
      left: GAP + column * (CELL_WIDTH + GAP),
      top: GAP + row * (CELL_HEIGHT + GAP),
      identity,
      order: index + 1,
    };
  }));

  const buffer = await sharp({
    create: { width, height, channels: 3, background: BACKGROUND },
  })
    .composite(cells.map(({ input, left, top }) => ({ input, left, top })))
    .webp({ quality: 95, effort: 4 })
    .toBuffer();
  const sha256 = digest(buffer);
  return {
    buffer,
    mimeType: "image/webp",
    fileName: `cast-identity-board-${sha256.slice("sha256:".length, "sha256:".length + 16)}.webp`,
    evidence: {
      kind: "cast_identity_board",
      version: CAST_IDENTITY_BOARD_LAYOUT_VERSION,
      sha256,
      width,
      height,
      columns,
      rows,
      cellWidth: CELL_WIDTH,
      cellHeight: CELL_HEIGHT,
      gap: GAP,
      sources: cells.map(({ identity, left, top, order }) => ({
        sourceAssetId: identity.sourceAssetId,
        label: identity.label,
        order,
        sourceWidth: identity.sourceWidth,
        sourceHeight: identity.sourceHeight,
        preparedWidth: identity.width,
        preparedHeight: identity.height,
        cell: { x: left, y: top, width: CELL_WIDTH, height: CELL_HEIGHT },
      })),
    },
  };
}

function boardGrid(count: number): { columns: number; rows: number } {
  if (count <= 3) return { columns: count, rows: 1 };
  if (count <= 6) return { columns: 3, rows: 2 };
  if (count <= 8) return { columns: 4, rows: 2 };
  if (count <= 9) return { columns: 3, rows: 3 };
  return { columns: 4, rows: 3 };
}

function toSupportedMimeType(format: string | undefined): CandidateImageInspection["mimeType"] | null {
  if (format === "png") return "image/png";
  if (format === "jpeg" || format === "jpg") return "image/jpeg";
  if (format === "webp") return "image/webp";
  return null;
}

function normalizeFileName(fileName: string, mimeType: CandidateImageInspection["mimeType"]): string {
  const extension = mimeType === "image/png" ? ".png" : mimeType === "image/jpeg" ? ".jpg" : ".webp";
  return `${safeBaseName(fileName)}${extension}`;
}

function safeBaseName(fileName: string): string {
  const value = path.basename(fileName, path.extname(fileName)).replace(/[^a-zA-Z0-9._-]+/g, "-");
  return value || "reference";
}

function digest(buffer: Buffer): `sha256:${string}` {
  return `sha256:${createHash("sha256").update(buffer).digest("hex")}`;
}
