import { describe, expect, it } from "vitest";
import { inspectLayoutImageNormalizationV1 } from "./layout-image-normalization.util.js";

const png = Buffer.from("89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360000002000005fe02fea20000000049454e44ae426082", "hex");

function jpegWithOrientation(orientation: number): Buffer {
  const tiff = Buffer.from([
    0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00,
    0x01, 0x00,
    0x12, 0x01, 0x03, 0x00, 0x01, 0x00, 0x00, 0x00,
    orientation, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00,
  ]);
  const payload = Buffer.concat([Buffer.from("Exif\0\0", "binary"), tiff]);
  const length = Buffer.alloc(2);
  length.writeUInt16BE(payload.length + 2);
  return Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe1]), length, payload, Buffer.from([0xff, 0xd9])]);
}

describe("G5 image normalization inspection", () => {
  it("accepts a static untagged PNG as orientation 1/sRGB", () => {
    expect(inspectLayoutImageNormalizationV1(png, "image/png")).toEqual({
      schemaVersion: 1,
      exifOrientation: 1,
      colorSpace: "srgb",
      animated: false,
      issueCodes: [],
    });
  });

  it("rejects a JPEG whose EXIF orientation was not normalized", () => {
    expect(inspectLayoutImageNormalizationV1(jpegWithOrientation(6), "image/jpeg").issueCodes)
      .toContain("IMAGE_ORIENTATION_UNNORMALIZED");
  });

  it("rejects unsupported or mismatched image bytes instead of guessing in Chromium", () => {
    expect(inspectLayoutImageNormalizationV1(Buffer.from("<svg/>"), "image/svg+xml").issueCodes)
      .toEqual(["IMAGE_ORIENTATION_UNNORMALIZED", "IMAGE_COLORSPACE_UNSUPPORTED"]);
  });
});
