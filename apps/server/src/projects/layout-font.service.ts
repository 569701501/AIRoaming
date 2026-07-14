import { HttpException, Inject, Injectable } from "@nestjs/common";
import type { Prisma, PrismaClient } from "@prisma/client";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import * as path from "node:path";
import {
  digestCanonicalJson,
  parseLayoutFontAssetMetadataV1,
  type LayoutDigest,
  type LayoutFontAssetMetadataV1,
  type LayoutFontCatalogItemV1,
  type LayoutFontCatalogResponseV1,
  type LayoutFontProvisionResponseV1,
} from "@airoaming/shared";

import { PrismaService } from "../persistence/prisma.service.js";
import { WorkspacePathService } from "../workspace/workspace-path.service.js";
import { ProjectDeleteOutboxService } from "./project-delete-outbox.service.js";
import type { VersionScopeV1 } from "./versioning/versioning-database.types.js";

type Reader = Prisma.TransactionClient | PrismaClient;

const require = createRequire(import.meta.url);
const fontkit = require("fontkit") as {
  create(buffer: Buffer): {
    characterSet: number[];
    postscriptName?: string | null;
    italicAngle?: number;
    "OS/2"?: { usWeightClass?: number };
  };
};

const FONT_PACKAGE_ID = "@openfonts/noto-sans-sc_chinese-simplified@1.44.9";
const FONT_LICENSE_SOURCE = "https://github.com/notofonts/noto-cjk/blob/main/Sans/LICENSE";
const FONT_PACKAGE_NAME = "@openfonts/noto-sans-sc_chinese-simplified";

interface BundledFontFace {
  weight: 400 | 700;
  fileName: string;
  displayName: string;
  expectedSha256: LayoutDigest;
  expectedCmapDigest: LayoutDigest;
  expectedCodePointCount: number;
}

const BUNDLED_FONT_FACES: readonly BundledFontFace[] = [
  {
    weight: 400,
    fileName: "noto-sans-sc-chinese-simplified-400.woff2",
    displayName: "Noto Sans SC 受控常规体",
    expectedSha256: "sha256:e1f8a59c19da8a5d97b7703d07ee2416e86cbc3b30fb20cb0d6fd30df43364ce",
    expectedCmapDigest: "sha256:f0aadbba133c9af21f940a346e61c5235bc9fe0197b7581b8ddfda5d48af19b3",
    expectedCodePointCount: 7898,
  },
  {
    weight: 700,
    fileName: "noto-sans-sc-chinese-simplified-700.woff2",
    displayName: "Noto Sans SC 受控粗体",
    expectedSha256: "sha256:989da46b79020196982ff943896843d69a8a16412a385b726b525dd626cf39f4",
    expectedCmapDigest: "sha256:f0aadbba133c9af21f940a346e61c5235bc9fe0197b7581b8ddfda5d48af19b3",
    expectedCodePointCount: 7898,
  },
] as const;

function sha256(bytes: Uint8Array): LayoutDigest {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function fontError(code: string, status: number, details?: unknown): never {
  throw new HttpException({
    success: false,
    error: { code, message: code, ...(details === undefined ? {} : { details }) },
  }, status);
}

function cmapRanges(codePoints: readonly number[]): Array<[number, number]> {
  if (codePoints.length === 0) fontError("LAYOUT_FONT_CMAP_EMPTY", 500);
  const ranges: Array<[number, number]> = [];
  let start = codePoints[0]!;
  let end = start;
  for (const codePoint of codePoints.slice(1)) {
    if (codePoint === end + 1) end = codePoint;
    else {
      ranges.push([start, end]);
      start = codePoint;
      end = codePoint;
    }
  }
  ranges.push([start, end]);
  return ranges;
}

function bundledFontPath(face: BundledFontFace): string {
  try {
    return require.resolve(`${FONT_PACKAGE_NAME}/files/${face.fileName}`);
  } catch {
    fontError("LAYOUT_FONT_BUNDLE_MISSING", 500, { packageId: FONT_PACKAGE_ID, fileName: face.fileName });
  }
}

function inspectBundledFont(face: BundledFontFace, bytes: Buffer): LayoutFontAssetMetadataV1 {
  if (sha256(bytes) !== face.expectedSha256) {
    fontError("LAYOUT_FONT_BUNDLE_DIGEST_MISMATCH", 500, { fileName: face.fileName });
  }
  let codePoints: number[];
  try {
    codePoints = [...new Set(fontkit.create(bytes).characterSet)].sort((left, right) => left - right);
  } catch {
    fontError("LAYOUT_FONT_FORMAT_UNSUPPORTED", 422, { fileName: face.fileName });
  }
  const cmapDigest = digestCanonicalJson(codePoints);
  if (cmapDigest !== face.expectedCmapDigest || codePoints.length !== face.expectedCodePointCount) {
    fontError("LAYOUT_FONT_CMAP_MISMATCH", 500, { fileName: face.fileName });
  }
  return parseLayoutFontAssetMetadataV1({
    schemaVersion: 1,
    kind: "layout_font_asset_v1",
    packageId: FONT_PACKAGE_ID,
    familyName: "Noto Sans SC",
    displayName: face.displayName,
    face: { weight: face.weight, style: "normal" },
    format: "woff2",
    license: {
      spdx: "OFL-1.1",
      sourceUrl: FONT_LICENSE_SOURCE,
      embeddingAllowed: true,
    },
    cmap: {
      digest: cmapDigest,
      codePointCount: codePoints.length,
      ranges: cmapRanges(codePoints),
    },
  });
}

function fontAssetId(projectId: string, face: BundledFontFace): string {
  const suffix = createHash("sha256").update(`${projectId}\0${face.expectedSha256}`).digest("hex").slice(0, 24);
  return `font_${suffix}`;
}

function fontStorageKey(projectId: string, face: BundledFontFace): string {
  return `projects/${projectId}/fonts/noto-sans-sc-${face.weight}.woff2`;
}

@Injectable()
export class LayoutFontService {
  constructor(
    @Inject(PrismaService) private readonly prismaService: PrismaService,
    @Inject(WorkspacePathService) private readonly workspacePath: WorkspacePathService,
    @Inject(ProjectDeleteOutboxService) private readonly outbox: ProjectDeleteOutboxService,
  ) {}

  private database() {
    if (!this.prismaService.isDatabaseMode()) fontError("LAYOUT_DB_ONLY_REQUIRED", 409);
    return this.prismaService.database();
  }

  async list(scope: VersionScopeV1): Promise<LayoutFontCatalogResponseV1> {
    return this.prismaService.runReadTransaction(async (tx) => ({
      schemaVersion: 1,
      projectId: scope.projectId,
      chapterId: scope.chapterId,
      items: await this.catalogItems(scope, tx, true),
    }));
  }

  async provision(scope: VersionScopeV1): Promise<LayoutFontProvisionResponseV1> {
    this.database();
    const project = await this.database().project.findUnique({
      where: { id: scope.projectId },
      select: { lifecycleStatus: true, chaptersByProject: { where: { id: scope.chapterId }, select: { id: true } } },
    });
    if (!project || project.chaptersByProject.length !== 1) fontError("LAYOUT_WORKING_COPY_NOT_FOUND", 404);
    if (project.lifecycleStatus !== "active") fontError("LAYOUT_PROJECT_NOT_ACTIVE", 409);
    await this.workspacePath.ensureReady();
    let created = false;
    const targetEventIds: string[] = [];
    for (const face of BUNDLED_FONT_FACES) {
      const bytes = await readFile(bundledFontPath(face));
      const metadata = inspectBundledFont(face, bytes);
      const assetId = fontAssetId(scope.projectId, face);
      const finalStorageKey = fontStorageKey(scope.projectId, face);
      const existing = await this.database().asset.findUnique({ where: { id: assetId } });
      if (existing) {
        if (existing.projectId !== scope.projectId || existing.storageKey !== finalStorageKey || existing.status === "failed" || existing.status === "deleting") {
          fontError("LAYOUT_FONT_ASSET_CONFLICT", 409, { assetId });
        }
        const pending = await this.database().outboxEvent.findUnique({
          where: { idempotencyKey: `layout_font_provision:${scope.projectId}:${face.expectedSha256}` },
        });
        if (existing.status !== "ready" && pending) targetEventIds.push(pending.id);
        continue;
      }
      const tempStorageKey = `projects/${scope.projectId}/.staging/${assetId}-${randomUUID()}.woff2`;
      const tempPath = this.workspacePath.resolveVirtualPath(`/workspace/${tempStorageKey}`);
      await mkdir(path.dirname(tempPath), { recursive: true });
      await writeFile(tempPath, bytes, { flag: "wx" });
      const payload = {
        schemaVersion: 1 as const,
        assetId,
        projectId: scope.projectId,
        chapterId: null,
        tempStorageKey,
        finalStorageKey,
        sha256: face.expectedSha256,
        bytes: bytes.byteLength,
      };
      const eventId = `outbox_${randomUUID()}`;
      const now = new Date();
      await this.prismaService.runBusinessTransaction(async (tx) => {
        await tx.asset.create({
          data: {
            id: assetId,
            projectId: scope.projectId,
            chapterId: null,
            type: "font",
            role: "layout_font",
            mimeType: "font/woff2",
            storageKey: finalStorageKey,
            status: "staged",
            sha256: null,
            bytes: null,
            width: null,
            height: null,
            durationMs: null,
            sourceTaskId: null,
            metadataJson: metadata as unknown as Prisma.InputJsonValue,
            metadataSchemaVersion: 1,
            metadataDigest: digestCanonicalJson(metadata),
            createdAt: now,
            updatedAt: now,
          },
        });
        await tx.outboxEvent.create({
          data: {
            id: eventId,
            eventType: "asset.promote",
            aggregateType: "asset",
            aggregateId: assetId,
            payloadJson: payload as unknown as Prisma.InputJsonValue,
            payloadSchemaVersion: 1,
            payloadDigest: digestCanonicalJson(payload),
            status: "pending",
            attempt: 0,
            maxAttempts: 3,
            availableAt: now,
            createdAt: now,
            updatedAt: now,
            idempotencyKey: `layout_font_provision:${scope.projectId}:${face.expectedSha256}`,
          },
        });
      });
      created = true;
      targetEventIds.push(eventId);
    }
    await this.processPromotionEvents(targetEventIds);
    const items = await this.prismaService.runReadTransaction((tx) => this.catalogItems(scope, tx, true));
    return {
      schemaVersion: 1,
      result: created ? "provisioned" : "existing",
      projectId: scope.projectId,
      chapterId: scope.chapterId,
      items,
    };
  }

  async ensureReady(scope: VersionScopeV1): Promise<LayoutFontCatalogItemV1[]> {
    return (await this.provision(scope)).items;
  }

  async listForReader(
    scope: VersionScopeV1,
    reader: Reader,
    verifyBytes = true,
  ): Promise<LayoutFontCatalogItemV1[]> {
    return this.catalogItems(scope, reader, verifyBytes);
  }

  async validateReferences(scope: VersionScopeV1, assetIds: readonly string[], reader: Reader): Promise<void> {
    const items = await this.catalogItems(scope, reader, true);
    const available = new Set(items.map((item) => item.assetId));
    const missing = [...new Set(assetIds)].filter((assetId) => !available.has(assetId));
    if (missing.length) fontError("LAYOUT_FONT_REFERENCE_INVALID", 422, { assetIds: missing });
  }

  async readFontFile(scope: VersionScopeV1, assetId: string): Promise<{ buffer: Buffer; mimeType: string; fileName: string; sha256: LayoutDigest }> {
    const item = await this.prismaService.runReadTransaction(async (tx) => {
      const items = await this.catalogItems(scope, tx, true);
      return items.find((candidate) => candidate.assetId === assetId) ?? null;
    });
    if (!item) fontError("LAYOUT_FONT_ASSET_MISSING", 404, { assetId });
    const row = await this.database().asset.findUniqueOrThrow({ where: { id: assetId }, select: { storageKey: true } });
    const buffer = await readFile(this.workspacePath.resolveVirtualPath(`/workspace/${row.storageKey}`));
    if (sha256(buffer) !== item.sha256 || buffer.byteLength !== item.bytes) fontError("LAYOUT_FONT_ASSET_DIGEST_MISMATCH", 409, { assetId });
    return { buffer, mimeType: item.mimeType, fileName: path.basename(row.storageKey), sha256: item.sha256 };
  }

  private async processPromotionEvents(eventIds: readonly string[]): Promise<void> {
    const pending = new Set(eventIds);
    for (let iteration = 0; pending.size > 0 && iteration < 256; iteration += 1) {
      const rows = await this.database().outboxEvent.findMany({ where: { id: { in: [...pending] } }, select: { id: true, status: true, lastErrorJson: true } });
      for (const row of rows) {
        if (row.status === "processed") pending.delete(row.id);
        else if (row.status === "failed") fontError("LAYOUT_FONT_PROMOTION_FAILED", 500, { eventId: row.id, error: row.lastErrorJson });
      }
      if (pending.size === 0) return;
      const result = await this.outbox.processNext(`layout-font-${randomUUID()}`);
      if (!result) break;
    }
    if (pending.size) fontError("LAYOUT_FONT_PROMOTION_PENDING", 409, { eventIds: [...pending] });
  }

  private async catalogItems(scope: VersionScopeV1, reader: Reader, verifyBytes: boolean): Promise<LayoutFontCatalogItemV1[]> {
    const rows = await reader.asset.findMany({
      where: {
        projectId: scope.projectId,
        type: "font",
        role: "layout_font",
        status: "ready",
        OR: [{ chapterId: null }, { chapterId: scope.chapterId }],
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
    const items: LayoutFontCatalogItemV1[] = [];
    for (const row of rows) {
      if (row.mimeType !== "font/woff2" && row.mimeType !== "font/otf" && row.mimeType !== "font/ttf") {
        fontError("LAYOUT_FONT_FORMAT_UNSUPPORTED", 422, { assetId: row.id, mimeType: row.mimeType });
      }
      if (!row.sha256 || !/^sha256:[0-9a-f]{64}$/.test(row.sha256) || !row.bytes || row.bytes <= 0) {
        fontError("LAYOUT_FONT_REFERENCE_INVALID", 422, { assetId: row.id });
      }
      let metadata: LayoutFontAssetMetadataV1;
      try {
        metadata = parseLayoutFontAssetMetadataV1(row.metadataJson);
      } catch (error) {
        fontError("LAYOUT_FONT_METADATA_INVALID", 422, { assetId: row.id, message: error instanceof Error ? error.message : String(error) });
      }
      if (digestCanonicalJson(metadata) !== row.metadataDigest) fontError("LAYOUT_FONT_METADATA_DIGEST_MISMATCH", 409, { assetId: row.id });
      if (verifyBytes) {
        let bytes: Buffer;
        try {
          bytes = await readFile(this.workspacePath.resolveVirtualPath(`/workspace/${row.storageKey}`));
        } catch {
          fontError("LAYOUT_FONT_ASSET_MISSING", 409, { assetId: row.id });
        }
        if (bytes.byteLength !== row.bytes || sha256(bytes) !== row.sha256) {
          fontError("LAYOUT_FONT_ASSET_DIGEST_MISMATCH", 409, { assetId: row.id });
        }
        let actualCodePoints: number[];
        let actualWeight = 0;
        let actualItalic = false;
        try {
          const actualFont = fontkit.create(bytes);
          actualCodePoints = [...new Set(actualFont.characterSet)].sort((left, right) => left - right);
          actualWeight = actualFont["OS/2"]?.usWeightClass ?? 0;
          actualItalic = (actualFont.italicAngle ?? 0) !== 0;
        } catch {
          fontError("LAYOUT_FONT_FORMAT_UNSUPPORTED", 422, { assetId: row.id });
        }
        if (
          actualCodePoints.length !== metadata.cmap.codePointCount
          || digestCanonicalJson(actualCodePoints) !== metadata.cmap.digest
          || digestCanonicalJson(cmapRanges(actualCodePoints)) !== digestCanonicalJson(metadata.cmap.ranges)
        ) {
          fontError("LAYOUT_FONT_CMAP_MISMATCH", 409, { assetId: row.id });
        }
        if (actualWeight !== metadata.face.weight || actualItalic !== (metadata.face.style === "italic")) {
          fontError("LAYOUT_FONT_FACE_MISMATCH", 409, { assetId: row.id });
        }
      }
      items.push({
        assetId: row.id,
        sha256: row.sha256 as LayoutDigest,
        bytes: row.bytes,
        mimeType: row.mimeType,
        metadata,
      });
    }
    return items;
  }
}
