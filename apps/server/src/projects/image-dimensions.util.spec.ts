import { describe, expect, it } from "vitest";
import { readImageDimensions } from "./image-dimensions.util.js";

describe("readImageDimensions", () => {
  it("读取 PNG 和 WebP VP8X 图片头中的实际宽高", () => {
    const png = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
      "base64",
    );
    const webp = Buffer.alloc(30);
    webp.write("RIFF", 0, "ascii");
    webp.writeUInt32LE(22, 4);
    webp.write("WEBP", 8, "ascii");
    webp.write("VP8X", 12, "ascii");
    webp.writeUInt32LE(10, 16);
    webp.writeUIntLE(1024 - 1, 24, 3);
    webp.writeUIntLE(1536 - 1, 27, 3);

    expect(readImageDimensions(png)).toEqual({ width: 1, height: 1 });
    expect(readImageDimensions(webp)).toEqual({ width: 1024, height: 1536 });
    expect(readImageDimensions(Buffer.from("not-an-image"))).toBeNull();
  });
});
