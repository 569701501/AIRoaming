import sharp from "sharp";
import { describe, expect, it } from "vitest";
import {
  buildCastIdentityBoard,
  prepareCandidateIdentityImage,
} from "./candidate-reference-image.util.js";

async function solidImage(width: number, height: number, color: string): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 3, background: color } }).png().toBuffer();
}

describe("candidate reference image compiler", () => {
  it("按固定布局生成无文字身份板并保留逐人单元证据", async () => {
    const sources = await Promise.all([
      ["asset_a", "角色 A", "#dc2626"],
      ["asset_b", "角色 B", "#2563eb"],
      ["asset_c", "角色 C", "#16a34a"],
    ].map(async ([assetId, label, color]) => prepareCandidateIdentityImage({
      assetId: assetId!,
      label: label!,
      buffer: await solidImage(360, 640, color!),
      fileName: `${assetId}.png`,
    })));

    const first = await buildCastIdentityBoard(sources);
    const second = await buildCastIdentityBoard(sources);
    const metadata = await sharp(first.buffer).metadata();

    expect(first.evidence).toMatchObject({
      kind: "cast_identity_board",
      version: "cast_identity_board_v1",
      columns: 3,
      rows: 1,
      cellWidth: 640,
      cellHeight: 896,
      sources: [
        { sourceAssetId: "asset_a", order: 1 },
        { sourceAssetId: "asset_b", order: 2 },
        { sourceAssetId: "asset_c", order: 3 },
      ],
    });
    expect(metadata).toMatchObject({ format: "webp", width: 2016, height: 944 });
    expect(first.evidence.sha256).toBe(second.evidence.sha256);
    expect(first.buffer.equals(second.buffer)).toBe(true);
  });
});
