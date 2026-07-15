export interface ImageDimensions {
  width: number;
  height: number;
}

export type SupportedImageMimeType = "image/png" | "image/jpeg" | "image/webp";

/** MIME 以字节头为事实源，不能只信 provider 声明或文件扩展名。 */
export function detectImageMimeType(buffer: Buffer): SupportedImageMimeType | null {
  if (buffer.length >= 8 && buffer.subarray(0, 8).toString("hex") === "89504e470d0a1a0a") return "image/png";
  if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xd8) return "image/jpeg";
  if (buffer.length >= 12 && buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP") return "image/webp";
  return null;
}

/**
 * Provider 可以返回与请求像素不同但比例等价的图片，因此这里只校验宽高比。
 * 使用对数距离让横图/竖图误差对称，3% 容差覆盖常见取整差异。
 */
export function getImageAspectRatioWarning(
  requested: ImageDimensions,
  actual: ImageDimensions | null,
  tolerance = 0.03,
): string | null {
  if (!actual) {
    return "candidate_output_dimensions_unreadable";
  }
  const requestedRatio = requested.width / requested.height;
  const actualRatio = actual.width / actual.height;
  const distance = Math.abs(Math.log(requestedRatio / actualRatio));
  if (distance <= tolerance) {
    return null;
  }
  return `candidate_output_aspect_ratio_mismatch:${requested.width}x${requested.height}:${actual.width}x${actual.height}`;
}

/** 读取常见 provider 图片格式的头部尺寸，不解码整张图片。 */
export function readImageDimensions(buffer: Buffer): ImageDimensions | null {
  return readPngDimensions(buffer) ?? readWebpDimensions(buffer) ?? readJpegDimensions(buffer);
}

function readPngDimensions(buffer: Buffer): ImageDimensions | null {
  if (
    buffer.length < 24
    || buffer[0] !== 0x89
    || buffer.toString("ascii", 1, 4) !== "PNG"
  ) {
    return null;
  }
  return validDimensions(buffer.readUInt32BE(16), buffer.readUInt32BE(20));
}

function readWebpDimensions(buffer: Buffer): ImageDimensions | null {
  if (buffer.length < 30 || buffer.toString("ascii", 0, 4) !== "RIFF" || buffer.toString("ascii", 8, 12) !== "WEBP") {
    return null;
  }
  const chunk = buffer.toString("ascii", 12, 16);
  if (chunk === "VP8X") {
    return validDimensions(buffer.readUIntLE(24, 3) + 1, buffer.readUIntLE(27, 3) + 1);
  }
  if (chunk === "VP8 " && buffer.length >= 30 && buffer[23] === 0x9d && buffer[24] === 0x01 && buffer[25] === 0x2a) {
    return validDimensions(buffer.readUInt16LE(26) & 0x3fff, buffer.readUInt16LE(28) & 0x3fff);
  }
  if (chunk === "VP8L" && buffer.length >= 25 && buffer[20] === 0x2f) {
    const b0 = buffer[21] ?? 0;
    const b1 = buffer[22] ?? 0;
    const b2 = buffer[23] ?? 0;
    const b3 = buffer[24] ?? 0;
    const width = 1 + b0 + ((b1 & 0x3f) << 8);
    const height = 1 + (b1 >> 6) + (b2 << 2) + ((b3 & 0x0f) << 10);
    return validDimensions(width, height);
  }
  return null;
}

function readJpegDimensions(buffer: Buffer): ImageDimensions | null {
  if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) {
    return null;
  }
  const startOfFrameMarkers = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);
  let offset = 2;
  while (offset + 8 < buffer.length) {
    if (buffer[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = buffer[offset + 1];
    if (marker === undefined) return null;
    if (startOfFrameMarkers.has(marker)) {
      return validDimensions(buffer.readUInt16BE(offset + 7), buffer.readUInt16BE(offset + 5));
    }
    if (marker === 0xd8 || marker === 0xd9 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      offset += 2;
      continue;
    }
    if (offset + 4 > buffer.length) return null;
    const segmentLength = buffer.readUInt16BE(offset + 2);
    if (segmentLength < 2) return null;
    offset += 2 + segmentLength;
  }
  return null;
}

function validDimensions(width: number, height: number): ImageDimensions | null {
  return Number.isInteger(width) && Number.isInteger(height) && width > 0 && height > 0
    ? { width, height }
    : null;
}
