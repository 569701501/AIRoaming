import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const prototypeRoot = path.dirname(fileURLToPath(import.meta.url));
const fontDir = path.join(prototypeRoot, ".runtime/fonts");
const fontPath = path.join(fontDir, "NotoSansCJKsc-Regular.otf");
const temporaryPath = `${fontPath}.download`;
const expectedSha = "2c76254f6fc379fddfce0a7e84fb5385bb135d3e399294f6eeb6680d0365b74b";
const sourceUrl = "https://raw.githubusercontent.com/notofonts/noto-cjk/main/Sans/OTF/SimplifiedChinese/NotoSansCJKsc-Regular.otf";

await mkdir(fontDir, { recursive: true });
if (existsSync(fontPath) && sha256(await readFile(fontPath)) === expectedSha) {
  process.stdout.write(`E0_FONT_READY sha256:${expectedSha}\n`);
  process.exit(0);
}

await rm(temporaryPath, { force: true });
const response = await fetch(sourceUrl, { redirect: "error" });
if (!response.ok) throw new Error(`E0_FONT_DOWNLOAD_FAILED:${response.status}`);
const bytes = Buffer.from(await response.arrayBuffer());
if (sha256(bytes) !== expectedSha) throw new Error("E0_FONT_DOWNLOAD_SHA_MISMATCH");
await writeFile(temporaryPath, bytes, { flag: "wx", mode: 0o600 });
await rename(temporaryPath, fontPath);
process.stdout.write(`E0_FONT_READY sha256:${expectedSha}\n`);

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}
