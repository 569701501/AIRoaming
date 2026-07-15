export type LayoutImageNormalizationIssueCodeV1 =
  | "IMAGE_ORIENTATION_UNNORMALIZED"
  | "IMAGE_COLORSPACE_UNSUPPORTED"
  | "IMAGE_ANIMATION_UNSUPPORTED";

export interface LayoutImageNormalizationInspectionV1 {
  schemaVersion: 1;
  exifOrientation: number;
  colorSpace: "srgb" | "unsupported";
  animated: boolean;
  issueCodes: LayoutImageNormalizationIssueCodeV1[];
}

function tiffOrientation(bytes: Buffer): number | null {
  if (bytes.length < 14) return null;
  const little = bytes.toString("ascii", 0, 2) === "II";
  const big = bytes.toString("ascii", 0, 2) === "MM";
  if (!little && !big) return null;
  const u16 = (offset: number) => little ? bytes.readUInt16LE(offset) : bytes.readUInt16BE(offset);
  const u32 = (offset: number) => little ? bytes.readUInt32LE(offset) : bytes.readUInt32BE(offset);
  if (u16(2) !== 42) return null;
  const ifdOffset = u32(4);
  if (ifdOffset + 2 > bytes.length) return null;
  const count = u16(ifdOffset);
  for (let index = 0; index < count; index += 1) {
    const offset = ifdOffset + 2 + index * 12;
    if (offset + 12 > bytes.length) return null;
    if (u16(offset) !== 0x0112) continue;
    if (u16(offset + 2) !== 3 || u32(offset + 4) !== 1) return null;
    return u16(offset + 8);
  }
  return 1;
}

function exifOrientation(bytes: Buffer): number | null {
  const prefix = bytes.subarray(0, 6).toString("binary") === "Exif\0\0" ? 6 : 0;
  return tiffOrientation(bytes.subarray(prefix));
}

function profileLooksSrgb(bytes: Buffer): boolean {
  return bytes.toString("latin1").toLowerCase().includes("srgb");
}

function inspectPng(bytes: Buffer): { orientation: number; colorSpace: "srgb" | "unsupported"; animated: boolean } | null {
  if (bytes.length < 24 || bytes.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a") return null;
  let offset = 8;
  let colorSpace: "srgb" | "unsupported" = "srgb";
  let animated = false;
  while (offset + 12 <= bytes.length) {
    const length = bytes.readUInt32BE(offset);
    const type = bytes.toString("ascii", offset + 4, offset + 8);
    const end = offset + 12 + length;
    if (end > bytes.length) break;
    const data = bytes.subarray(offset + 8, offset + 8 + length);
    if (type === "acTL") animated = true;
    if (type === "iCCP") {
      const separator = data.indexOf(0);
      const profileName = data.subarray(0, separator < 0 ? data.length : separator);
      if (!profileLooksSrgb(profileName)) colorSpace = "unsupported";
    }
    offset = end;
    if (type === "IEND") break;
  }
  return { orientation: 1, colorSpace, animated };
}

function inspectJpeg(bytes: Buffer): { orientation: number; colorSpace: "srgb" | "unsupported"; animated: false } | null {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  let offset = 2;
  let orientation = 1;
  let colorSpace: "srgb" | "unsupported" = "srgb";
  while (offset + 4 <= bytes.length) {
    if (bytes[offset] !== 0xff) { offset += 1; continue; }
    const marker = bytes[offset + 1]!;
    if (marker === 0xd9 || marker === 0xda) break;
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { offset += 2; continue; }
    const length = bytes.readUInt16BE(offset + 2);
    if (length < 2 || offset + 2 + length > bytes.length) break;
    const payload = bytes.subarray(offset + 4, offset + 2 + length);
    if (marker === 0xe1 && payload.subarray(0, 6).toString("binary") === "Exif\0\0") {
      orientation = exifOrientation(payload) ?? 0;
    }
    if (marker === 0xe2 && payload.subarray(0, 12).toString("binary") === "ICC_PROFILE\0") {
      if (!profileLooksSrgb(payload)) colorSpace = "unsupported";
    }
    offset += 2 + length;
  }
  return { orientation, colorSpace, animated: false };
}

function inspectWebp(bytes: Buffer): { orientation: number; colorSpace: "srgb" | "unsupported"; animated: boolean } | null {
  if (bytes.length < 12 || bytes.toString("ascii", 0, 4) !== "RIFF" || bytes.toString("ascii", 8, 12) !== "WEBP") return null;
  let offset = 12;
  let orientation = 1;
  let colorSpace: "srgb" | "unsupported" = "srgb";
  let animated = false;
  while (offset + 8 <= bytes.length) {
    const type = bytes.toString("ascii", offset, offset + 4);
    const length = bytes.readUInt32LE(offset + 4);
    const end = offset + 8 + length;
    if (end > bytes.length) break;
    const payload = bytes.subarray(offset + 8, end);
    if (type === "ANIM" || type === "ANMF") animated = true;
    if (type === "EXIF") orientation = exifOrientation(payload) ?? 0;
    if (type === "ICCP" && !profileLooksSrgb(payload)) colorSpace = "unsupported";
    offset = end + (length % 2);
  }
  return { orientation, colorSpace, animated };
}

export function inspectLayoutImageNormalizationV1(
  bytes: Buffer,
  mimeType: string,
): LayoutImageNormalizationInspectionV1 {
  const inspected = mimeType === "image/png" ? inspectPng(bytes)
    : mimeType === "image/jpeg" ? inspectJpeg(bytes)
      : mimeType === "image/webp" ? inspectWebp(bytes)
        : null;
  const orientation = inspected?.orientation ?? 0;
  const colorSpace = inspected?.colorSpace ?? "unsupported";
  const animated = inspected?.animated ?? false;
  const issueCodes: LayoutImageNormalizationIssueCodeV1[] = [];
  if (orientation !== 1) issueCodes.push("IMAGE_ORIENTATION_UNNORMALIZED");
  if (colorSpace !== "srgb") issueCodes.push("IMAGE_COLORSPACE_UNSUPPORTED");
  if (animated) issueCodes.push("IMAGE_ANIMATION_UNSUPPORTED");
  return { schemaVersion: 1, exifOrientation: orientation, colorSpace, animated, issueCodes };
}
