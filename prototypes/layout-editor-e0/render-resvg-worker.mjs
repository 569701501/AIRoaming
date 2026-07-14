import { Resvg } from "@resvg/resvg-js";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const prototypeRoot = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(prototypeRoot, "../..");
const cjkFontPath = path.join(prototypeRoot, ".runtime/fonts/NotoSansCJKsc-Regular.otf");
const interFontPath = path.join(repoRoot, "tests/fixtures/layout/assets/inter-latin-400.woff2");
const chunks = [];
for await (const chunk of process.stdin) chunks.push(chunk);
const svg = Buffer.concat(chunks).toString("utf8");
const renderer = new Resvg(svg, {
  fitTo: { mode: "original" },
  background: "white",
  font: {
    fontFiles: [interFontPath, cjkFontPath],
    loadSystemFonts: false,
    defaultFontFamily: "Noto Sans CJK SC",
    sansSerifFamily: "Noto Sans CJK SC",
  },
});
process.stdout.write(renderer.render().asPng());
