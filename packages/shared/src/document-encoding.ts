export const DOCUMENT_ENCODING_POLICY_VERSION = "document_encoding_v1" as const;

export type DocumentEncodingV1 = "utf-8" | "gb18030";

function isLikelyUtf8(buffer: Uint8Array): boolean {
  let index = 0;
  const length = buffer.length;
  while (index < length) {
    const byte = buffer[index]!;
    if (byte < 0x80) {
      index += 1;
      continue;
    }
    let needed: number;
    let min: number;
    if ((byte & 0xe0) === 0xc0) { needed = 1; min = 0x80; }
    else if ((byte & 0xf0) === 0xe0) { needed = 2; min = 0x800; }
    else if ((byte & 0xf8) === 0xf0) { needed = 3; min = 0x10000; }
    else return false;
    if (index + needed >= length) return false;
    let codePoint = byte & (0x7f >> needed);
    for (let offset = 1; offset <= needed; offset += 1) {
      const next = buffer[index + offset]!;
      if ((next & 0xc0) !== 0x80) return false;
      codePoint = (codePoint << 6) | (next & 0x3f);
    }
    if (codePoint < min || codePoint > 0x10ffff || (codePoint >= 0xd800 && codePoint <= 0xdfff)) return false;
    index += needed + 1;
  }
  return true;
}

/**
 * 编码识别：UTF-8 严格校验通过则 utf-8，否则 gb18030（兼容 GBK/GB2312）。
 * 返回解码后的文本。
 */
export function decodeDocumentBufferV1(buffer: Uint8Array): {
  encoding: DocumentEncodingV1;
  text: string;
} {
  if (isLikelyUtf8(buffer)) {
    return { encoding: "utf-8", text: new TextDecoder("utf-8").decode(buffer) };
  }
  return { encoding: "gb18030", text: new TextDecoder("gb18030").decode(buffer) };
}
