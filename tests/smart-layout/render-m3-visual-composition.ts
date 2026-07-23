import { createHash } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildLayoutRenderPlanV1,
  composeVisuallyGuidedLayoutV1,
  digestCanonicalJson,
  projectLayoutDocumentV2ToV1,
  richTextPlainTextV1,
  type LayoutPublicationProfileV1,
  type LayoutVisualCompositionInputV1,
} from "../../packages/shared/src/index.ts";
import {
  LayoutRendererService,
  type ResolvedRenderAssetV1,
} from "../../apps/server/src/projects/layout-renderer.service.ts";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const fixtureRoot = path.join(repoRoot, "tests/fixtures/smart-layout");
const evidenceRoot = path.join(
  repoRoot,
  "文档/05_执行与记录/任务记录/2026-07-22_智能成稿编辑器重构/evidence/m3-visual-composition",
);
const outputRoot = path.join(evidenceRoot, "outputs");
const require = createRequire(path.join(repoRoot, "apps/server/package.json"));
const sharp = require("sharp") as any;

function sha256(bytes: Uint8Array): `sha256:${string}` {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

async function json(filePath: string): Promise<any> {
  return JSON.parse(await readFile(filePath, "utf8"));
}

function relativeEvidencePath(filePath: string): string {
  return path.relative(evidenceRoot, filePath).split(path.sep).join("/");
}

function compositionInput(fixture: any, visualFixture: any): LayoutVisualCompositionInputV1 {
  const visualVariant = visualFixture.variants.find((entry: any) => entry.variantId === fixture.variant.variantId);
  if (!visualVariant) throw new Error(`VISUAL_FIXTURE_MISSING:${fixture.variant.variantId}`);
  return {
    projectId: fixture.inputs.sourceCatalog.projectId,
    chapterId: fixture.inputs.sourceCatalog.chapterId,
    comicFormat: fixture.variant.comicFormat,
    profile: fixture.currentBaseline.layoutDocument.profile,
    fontPolicy: fixture.currentBaseline.layoutDocument.fontPolicy,
    storyboardVersion: {
      id: fixture.inputs.storyboardVersion.id,
      documentDigest: fixture.inputs.storyboardVersion.documentDigest,
      document: fixture.inputs.storyboardVersion.document,
    },
    sourceLockSetDigest: fixture.inputs.sourceCatalog.sourceLockSetDigest,
    sources: fixture.inputs.sourceCatalog.items,
    characterCatalog: fixture.inputs.characterCatalog.map((character: any) => ({
      characterId: character.id,
      name: character.name,
    })),
    visualEvidence: visualVariant.entries.map((entry: any) => ({
      shotId: entry.shotId,
      assetId: entry.analysis.assetId,
      assetDigest: entry.analysis.assetDigest,
      analysis: entry.analysis,
    })),
  };
}

async function resolvedAssets(fixture: any): Promise<ResolvedRenderAssetV1[]> {
  const manifest = fixture.currentBaseline.assetManifest;
  return Promise.all([...manifest.images, ...manifest.fonts].map(async (asset: any) => ({
    assetId: asset.assetId,
    mimeType: asset.mimeType,
    sha256: asset.sha256,
    bytes: await readFile(path.join(fixtureRoot, asset.relativePath)),
  })));
}

async function pagedContactSheet(
  cards: Array<{ label: string; filePath: string }>,
): Promise<{ filePath: string; width: number; height: number; sha256: string; bytes: number }> {
  const cardWidth = 280;
  const imageWidth = 252;
  const imageHeight = 336;
  const labelHeight = 42;
  const cardHeight = imageHeight + labelHeight + 24;
  const columns = 4;
  const rows = Math.ceil(cards.length / columns);
  const width = columns * cardWidth + 24;
  const height = rows * cardHeight + 24;
  const composites: any[] = [];
  for (const [index, card] of cards.entries()) {
    const left = 24 + (index % columns) * cardWidth;
    const top = 18 + Math.floor(index / columns) * cardHeight;
    const image = await sharp(card.filePath).resize(imageWidth, imageHeight, { fit: "fill" }).png().toBuffer();
    const label = Buffer.from(`<svg width="${imageWidth}" height="${labelHeight}" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#0f172a"/><text x="8" y="27" font-size="18" font-family="Arial, sans-serif" fill="#f8fafc">${card.label}</text></svg>`);
    composites.push({ input: image, left, top });
    composites.push({ input: label, left, top: top + imageHeight });
  }
  const bytes = await sharp({ create: { width, height, channels: 4, background: "#e2e8f0" } })
    .composite(composites).png().toBuffer();
  const filePath = path.join(evidenceRoot, "contact-sheet-paged.png");
  await writeFile(filePath, bytes);
  return { filePath, width, height, sha256: sha256(bytes), bytes: bytes.byteLength };
}

async function verticalContactSheet(
  cards: Array<{ label: string; filePath: string }>,
): Promise<{ filePath: string; width: number; height: number; sha256: string; bytes: number }> {
  const columnWidth = 230;
  const imageWidth = 204;
  const labelHeight = 42;
  const maximumPreviewHeight = 6_000;
  const resized = await Promise.all(cards.map(async (card) => {
    const metadata = await sharp(card.filePath).metadata();
    const targetHeight = Math.min(maximumPreviewHeight, Math.round((metadata.height as number) * imageWidth / (metadata.width as number)));
    const buffer = await sharp(card.filePath).resize({ width: imageWidth, height: targetHeight, fit: "fill" }).png().toBuffer();
    return { ...card, buffer, height: targetHeight };
  }));
  const width = cards.length * columnWidth + 24;
  const height = Math.max(...resized.map((card) => card.height)) + labelHeight + 36;
  const composites: any[] = [];
  for (const [index, card] of resized.entries()) {
    const left = 18 + index * columnWidth;
    const label = Buffer.from(`<svg width="${imageWidth}" height="${labelHeight}" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#0f172a"/><text x="6" y="27" font-size="15" font-family="Arial, sans-serif" fill="#f8fafc">${card.label}</text></svg>`);
    composites.push({ input: label, left, top: 14 });
    composites.push({ input: card.buffer, left, top: 14 + labelHeight });
  }
  const bytes = await sharp({ create: { width, height, channels: 4, background: "#e2e8f0" } })
    .composite(composites).png().toBuffer();
  const filePath = path.join(evidenceRoot, "contact-sheet-vertical.png");
  await writeFile(filePath, bytes);
  return { filePath, width, height, sha256: sha256(bytes), bytes: bytes.byteLength };
}

function emptyAggregate() {
  return {
    variantCount: 0,
    shotCount: 0,
    dialogueItemCount: 0,
    canvasCount: 0,
    panelCount: 0,
    balloonCount: 0,
    panelDirectUsableCount: 0,
    balloonDirectUsableCount: 0,
    cropPassedCount: 0,
    subjectOcclusionPassedCount: 0,
    shapeSafePassedCount: 0,
    tailSemanticsPassedCount: 0,
    textOverflowCount: 0,
    silentRewriteCount: 0,
  };
}

function addAggregate(
  target: ReturnType<typeof emptyAggregate>,
  plan: ReturnType<typeof composeVisuallyGuidedLayoutV1>,
): void {
  const quality = plan.report.quality;
  target.variantCount += 1;
  target.shotCount += plan.report.shotCoverage.expected;
  target.dialogueItemCount += plan.report.dialogueCoverage.expected;
  target.canvasCount += plan.document.canvases.length;
  target.panelCount += quality.panels.length;
  target.balloonCount += quality.balloons.length;
  target.panelDirectUsableCount += quality.panels.filter((item) => item.directUsable).length;
  target.balloonDirectUsableCount += quality.balloons.filter((item) => item.directUsable).length;
  target.cropPassedCount += quality.panels.filter((item) => item.cropOk).length;
  target.subjectOcclusionPassedCount += quality.panels.filter((item) => item.subjectOcclusionOk).length;
  target.shapeSafePassedCount += quality.balloons.filter((item) => item.shapeSafeOk).length;
  target.tailSemanticsPassedCount += quality.balloons.filter((item) => item.tailOk).length;
  target.textOverflowCount += plan.report.textOverflowCount;
  target.silentRewriteCount += plan.report.silentRewriteCount;
}

function rate(passed: number, total: number): number {
  return total === 0 ? 1 : Math.round(passed / total * 10_000) / 10_000;
}

function finalizeAggregate(value: ReturnType<typeof emptyAggregate>) {
  return {
    ...value,
    shotCoverageRate: rate(value.panelCount, value.shotCount),
    dialogueCoverageRate: rate(value.balloonCount, value.dialogueItemCount),
    panelDirectUsableRate: rate(value.panelDirectUsableCount, value.panelCount),
    balloonDirectUsableRate: rate(value.balloonDirectUsableCount, value.balloonCount),
    cropPassedRate: rate(value.cropPassedCount, value.panelCount),
    subjectOcclusionPassedRate: rate(value.subjectOcclusionPassedCount, value.panelCount),
    shapeSafePassedRate: rate(value.shapeSafePassedCount, value.balloonCount),
    tailSemanticsPassedRate: rate(value.tailSemanticsPassedCount, value.balloonCount),
  };
}

function csvCell(value: unknown): string {
  const text = value === null || value === undefined ? "" : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function csv(rows: unknown[][]): string {
  return `${rows.map((row) => row.map(csvCell).join(",")).join("\n")}\n`;
}

const reviewHeader = [
  "reviewer_id", "review_round", "variant_id", "comic_format", "item_type", "item_id", "shot_id", "source_text",
  "layout_ok", "crop_ok", "balloon_geometry_ok", "balloon_type_ok", "reading_order_ok", "subject_occlusion_ok",
  "text_fit_ok", "tail_ok", "shape_safe_ok", "adjustment_notes", "evidence_path",
];

function blankHumanReviewRow(automatedRow: unknown[]): unknown[] {
  return ["", "", ...automatedRow.slice(2, 8), ...Array.from({ length: 10 }, () => ""), automatedRow.at(-1)];
}

interface HumanReviewSeedV1 {
  variantId: string;
  comicFormat: "vertical_scroll" | "paged_comic";
  itemType: "panel" | "required_balloon";
  itemId: string;
  shotId: string;
  sourceText: string;
  evidencePath: string;
}

function humanReviewSeeds(rows: readonly unknown[][]): HumanReviewSeedV1[] {
  return rows.slice(1).map((row): HumanReviewSeedV1 => ({
    variantId: String(row[2] ?? ""),
    comicFormat: String(row[3] ?? "") as HumanReviewSeedV1["comicFormat"],
    itemType: String(row[4] ?? "") as HumanReviewSeedV1["itemType"],
    itemId: String(row[5] ?? ""),
    shotId: String(row[6] ?? ""),
    sourceText: String(row[7] ?? ""),
    evidencePath: String(row.at(-1) ?? ""),
  }));
}

function humanReviewPage(input: {
  round: "A" | "B";
  outputManifestDigest: string;
  rows: readonly HumanReviewSeedV1[];
}): string {
  const seed = JSON.stringify({
    schemaVersion: 1,
    round: input.round,
    outputManifestDigest: input.outputManifestDigest,
    rows: input.rows,
  }).replaceAll("<", "\\u003c");
  return `<!doctype html>
<html lang="zh-CN" data-review-round="${input.round}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta http-equiv="Content-Security-Policy" content="default-src 'self' data: blob:; img-src 'self' data:; style-src 'unsafe-inline'; script-src 'unsafe-inline'">
  <title>M3 独立人工盲评 · ${input.round} 轮</title>
  <style>
    :root{color-scheme:dark;--bg:#070b18;--panel:#10172a;--panel2:#151f37;--line:#2a3655;--text:#eef4ff;--muted:#9cabc7;--purple:#8b7cff;--mint:#52e0b1;--warn:#ffbf69;--bad:#ff718a}*{box-sizing:border-box}body{margin:0;background:radial-gradient(circle at 15% 0,#1b1745 0,transparent 34%),var(--bg);color:var(--text);font:15px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif}button,input,textarea{font:inherit}.top{position:sticky;top:0;z-index:20;padding:18px 24px;background:rgba(7,11,24,.94);backdrop-filter:blur(18px);border-bottom:1px solid var(--line)}.top-row{display:flex;gap:16px;align-items:center;flex-wrap:wrap}.title{font-size:22px;font-weight:750}.badge{padding:5px 10px;border:1px solid #6154c9;border-radius:999px;background:#241e55;color:#dcd7ff}.muted{color:var(--muted)}.stats{display:flex;gap:10px;flex-wrap:wrap;margin-top:12px}.stat{padding:7px 11px;border-radius:10px;background:var(--panel);border:1px solid var(--line)}.layout{display:grid;grid-template-columns:320px minmax(0,1fr);min-height:calc(100vh - 130px)}.sidebar{position:sticky;top:130px;height:calc(100vh - 130px);overflow:auto;padding:16px;border-right:1px solid var(--line);background:rgba(9,14,29,.76)}.group{width:100%;margin:0 0 8px;padding:11px 12px;text-align:left;color:var(--text);background:var(--panel);border:1px solid var(--line);border-radius:12px;cursor:pointer}.group.active{border-color:var(--purple);box-shadow:0 0 0 1px var(--purple) inset}.group.done{border-color:#287b68}.group-head{display:flex;justify-content:space-between;gap:10px;font-weight:650}.main{padding:22px;max-width:1500px;width:100%;margin:0 auto}.notice{padding:14px 16px;margin-bottom:16px;border:1px solid #554b9d;border-radius:14px;background:rgba(53,42,116,.28)}.reviewer{display:grid;grid-template-columns:minmax(220px,360px) 1fr;gap:12px;margin-bottom:18px}.field{padding:14px;border:1px solid var(--line);border-radius:14px;background:var(--panel)}.field input[type=text]{width:100%;margin-top:7px;padding:10px 12px;border:1px solid var(--line);border-radius:9px;background:#0b1121;color:var(--text)}.evidence{display:grid;grid-template-columns:minmax(340px,58%) 1fr;gap:18px;align-items:start}.image-panel,.items-panel{padding:16px;border:1px solid var(--line);border-radius:16px;background:rgba(16,23,42,.92)}.image-panel img{display:block;width:100%;max-height:75vh;object-fit:contain;background:white;border-radius:10px}.image-panel img.long-evidence{max-height:none;object-fit:fill}.image-meta{display:flex;justify-content:space-between;gap:10px;align-items:center;margin-bottom:12px}.image-meta a{color:#c5bcff}.toolbar{display:flex;gap:9px;align-items:center;flex-wrap:wrap;margin-bottom:12px}.btn{padding:9px 13px;border:1px solid var(--line);border-radius:10px;background:#1b2642;color:var(--text);cursor:pointer}.btn:hover{border-color:var(--purple)}.btn.pass{background:#123d35;border-color:#287b68}.btn.adjust{background:#472334;border-color:#8d3e58}.btn.primary{background:#4c3fc1;border-color:#7467ef}.btn:disabled{cursor:not-allowed;opacity:.45}.card{padding:14px;margin-bottom:12px;border:1px solid var(--line);border-radius:14px;background:var(--panel2)}.card.pass{border-color:#287b68}.card.adjust{border-color:#8d3e58}.card-title{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}.kind{font-weight:700}.source{margin:9px 0;padding:9px 11px;border-left:3px solid var(--purple);background:#0d1427}.actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}.criteria{display:none;margin-top:12px;padding:11px;border-radius:10px;background:#0c1325}.card.adjust .criteria{display:block}.criteria-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px;margin:8px 0}.criteria label{display:flex;gap:7px;align-items:center}.criteria textarea{width:100%;min-height:70px;padding:9px;border:1px solid var(--line);border-radius:8px;background:#080e1c;color:var(--text)}.error{color:#ff9aac;margin-top:6px}.footer-actions{position:sticky;bottom:0;display:flex;justify-content:space-between;gap:12px;align-items:center;margin-top:18px;padding:14px;border:1px solid var(--line);border-radius:14px;background:rgba(10,15,31,.94);backdrop-filter:blur(14px)}@media(max-width:980px){.layout{grid-template-columns:1fr}.sidebar{position:relative;top:0;height:auto;display:flex;overflow:auto;border-right:0;border-bottom:1px solid var(--line)}.group{min-width:230px;margin-right:8px}.evidence{grid-template-columns:1fr}.reviewer{grid-template-columns:1fr}.top{position:relative}.criteria-grid{grid-template-columns:1fr}}
  </style>
</head>
<body>
  <header class="top"><div class="top-row"><div class="title">M3 独立人工盲评</div><span class="badge">${input.round} 轮</span><span class="muted">自动评分未展示 · 不要查看另一轮结果</span></div><div id="stats" class="stats"></div></header>
  <div class="layout"><aside id="sidebar" class="sidebar"></aside><main class="main">
    <div class="notice">请按真实成品判断“是否无需调整即可使用”。默认全部未判断；只有看完全部 69 个画格和 59 个气泡后才能导出。</div>
    <section class="reviewer"><label class="field">评审人代号<input id="reviewer-id" type="text" autocomplete="off" placeholder="例如：reviewer-01"></label><label class="field"><input id="independent" type="checkbox"> 我确认独立完成本轮评审，未查看另一轮结果，也未照抄自动评分。</label></section>
    <section id="content"></section>
    <div class="footer-actions"><button id="reset" class="btn">清空本轮进度</button><div><span id="export-hint" class="muted"></span> <button id="export" class="btn primary" disabled>导出 ${input.round} 轮 CSV</button></div></div>
  </main></div>
  <script>
  "use strict";
  const seed=${seed};
  const reviewColumns=["reviewer_id","review_round","variant_id","comic_format","item_type","item_id","shot_id","source_text","layout_ok","crop_ok","balloon_geometry_ok","balloon_type_ok","reading_order_ok","subject_occlusion_ok","text_fit_ok","tail_ok","shape_safe_ok","adjustment_notes","evidence_path"];
  const criteria={panel:[{key:"layout_ok",label:"布局与分格"},{key:"crop_ok",label:"裁切与主体完整"},{key:"reading_order_ok",label:"阅读顺序"},{key:"subject_occlusion_ok",label:"主体无遮挡"}],required_balloon:[{key:"balloon_geometry_ok",label:"位置与尺寸"},{key:"balloon_type_ok",label:"气泡类型"},{key:"reading_order_ok",label:"阅读路径"},{key:"subject_occlusion_ok",label:"不遮挡主体"},{key:"text_fit_ok",label:"文字适配"},{key:"tail_ok",label:"尾巴指向"},{key:"shape_safe_ok",label:"文字安全内区"}]};
  const storageKey="m3-human-review:"+seed.outputManifestDigest+":"+seed.round;
  let saved={reviewerId:"",independent:false,current:0,decisions:{}};
  try{const value=localStorage.getItem(storageKey);if(value){const parsed=JSON.parse(value);if(parsed&&typeof parsed==="object")saved=Object.assign(saved,parsed)}}catch(_error){}
  const groups=[];const groupByKey=new Map();
  seed.rows.forEach(function(row){const key=row.variantId+"|"+row.evidencePath;let group=groupByKey.get(key);if(!group){group={key:key,variantId:row.variantId,comicFormat:row.comicFormat,evidencePath:row.evidencePath,items:[]};groupByKey.set(key,group);groups.push(group)}group.items.push(row)});
  saved.current=Math.max(0,Math.min(groups.length-1,Number(saved.current)||0));
  const byId=new Map(seed.rows.map(function(row){return[row.itemId,row]}));
  Object.keys(saved.decisions||{}).forEach(function(id){if(!byId.has(id))delete saved.decisions[id]});
  function decisionValid(row){const value=saved.decisions[row.itemId];if(!value)return false;if(value.state==="pass")return true;return value.state==="adjust"&&Array.isArray(value.failed)&&value.failed.length>0&&String(value.notes||"").trim().length>0}
  function directUsable(row){const value=saved.decisions[row.itemId];return decisionValid(row)&&value.state==="pass"}
  function persist(){saved.reviewerId=document.getElementById("reviewer-id").value.trim();saved.independent=document.getElementById("independent").checked;try{localStorage.setItem(storageKey,JSON.stringify(saved))}catch(_error){}}
  function summary(){const panels=seed.rows.filter(function(row){return row.itemType==="panel"});const balloons=seed.rows.filter(function(row){return row.itemType==="required_balloon"});const completed=seed.rows.filter(decisionValid).length;const panelPass=panels.filter(directUsable).length;const balloonPass=balloons.filter(directUsable).length;return{completed:completed,total:seed.rows.length,panelPass:panelPass,panelTotal:panels.length,balloonPass:balloonPass,balloonTotal:balloons.length,panelRate:panelPass/panels.length,balloonRate:balloonPass/balloons.length}}
  function pct(value){return(value*100).toFixed(2).replace(/\\.00$/,"%")+(String(value*100).includes(".")&&!((value*100)%1===0)?"%":"")}
  function renderStats(){const value=summary();const ready=value.completed===value.total&&saved.reviewerId&&saved.independent;document.getElementById("stats").innerHTML="<span class='stat'>进度 "+value.completed+"/"+value.total+"</span><span class='stat'>画格 "+value.panelPass+"/"+value.panelTotal+"（"+pct(value.panelRate)+"）</span><span class='stat'>气泡 "+value.balloonPass+"/"+value.balloonTotal+"（"+pct(value.balloonRate)+"）</span>";const button=document.getElementById("export");button.disabled=!ready;document.getElementById("export-hint").textContent=ready?(value.panelRate>=.8&&value.balloonRate>=.8?"本轮达到双 80%":"本轮未达到双 80%"):("还需完成 "+(value.total-value.completed)+" 项并填写独立声明")}
  function renderSidebar(){const root=document.getElementById("sidebar");root.textContent="";groups.forEach(function(group,index){const done=group.items.filter(decisionValid).length;const button=document.createElement("button");button.className="group"+(index===saved.current?" active":"")+(done===group.items.length?" done":"");button.type="button";button.dataset.groupIndex=String(index);const head=document.createElement("div");head.className="group-head";const name=document.createElement("span");name.textContent=group.variantId;const count=document.createElement("span");count.textContent=done+"/"+group.items.length;head.append(name,count);const path=document.createElement("div");path.className="muted";path.textContent=group.comicFormat==="paged_comic"?group.evidencePath.split("/").pop():"完整长图";button.append(head,path);button.addEventListener("click",function(){saved.current=index;persist();render()});root.append(button)})}
  function setDecision(row,state){const previous=saved.decisions[row.itemId]||{};saved.decisions[row.itemId]={state:state,failed:state==="adjust"?(Array.isArray(previous.failed)?previous.failed:[]):[],notes:state==="adjust"?String(previous.notes||""):""};persist();render()}
  function renderCard(row){const value=saved.decisions[row.itemId]||{state:"",failed:[],notes:""};const card=document.createElement("article");card.className="card"+(value.state?" "+value.state:"");card.dataset.itemId=row.itemId;const title=document.createElement("div");title.className="card-title";const left=document.createElement("div");const kind=document.createElement("div");kind.className="kind";kind.textContent=row.itemType==="panel"?"画格":"必需气泡";const shot=document.createElement("div");shot.className="muted";shot.textContent=row.shotId;left.append(kind,shot);const state=document.createElement("span");state.className="muted";state.textContent=value.state==="pass"?"直接可用":value.state==="adjust"?"需要调整":"未判断";title.append(left,state);card.append(title);if(row.sourceText){const source=document.createElement("div");source.className="source";source.textContent=row.sourceText;card.append(source)}const actions=document.createElement("div");actions.className="actions";const pass=document.createElement("button");pass.type="button";pass.className="btn pass";pass.dataset.action="pass";pass.textContent="直接可用";pass.addEventListener("click",function(){setDecision(row,"pass")});const adjust=document.createElement("button");adjust.type="button";adjust.className="btn adjust";adjust.dataset.action="adjust";adjust.textContent="需要调整";adjust.addEventListener("click",function(){setDecision(row,"adjust")});actions.append(pass,adjust);card.append(actions);const detail=document.createElement("div");detail.className="criteria";const intro=document.createElement("div");intro.textContent="请选择需要调整的原因（可多选）：";detail.append(intro);const grid=document.createElement("div");grid.className="criteria-grid";criteria[row.itemType].forEach(function(entry){const label=document.createElement("label");const input=document.createElement("input");input.type="checkbox";input.checked=(value.failed||[]).includes(entry.key);input.addEventListener("change",function(){const next=new Set(value.failed||[]);if(input.checked)next.add(entry.key);else next.delete(entry.key);value.failed=Array.from(next);saved.decisions[row.itemId]=value;persist();renderStats();renderSidebar();renderCardError()});label.append(input,document.createTextNode(entry.label));grid.append(label)});detail.append(grid);const notes=document.createElement("textarea");notes.placeholder="请说明要调整什么";notes.value=String(value.notes||"");notes.addEventListener("input",function(){value.notes=notes.value;saved.decisions[row.itemId]=value;persist();renderStats();renderSidebar();renderCardError()});detail.append(notes);const error=document.createElement("div");error.className="error";detail.append(error);function renderCardError(){error.textContent=value.state==="adjust"&&((value.failed||[]).length===0||!String(value.notes||"").trim())?"至少选择一个原因并填写说明。":""}renderCardError();card.append(detail);return card}
  function renderContent(){const group=groups[saved.current];const root=document.getElementById("content");root.textContent="";const evidence=document.createElement("div");evidence.className="evidence";const imagePanel=document.createElement("section");imagePanel.className="image-panel";const meta=document.createElement("div");meta.className="image-meta";const heading=document.createElement("strong");heading.textContent=group.variantId;const original=document.createElement("a");original.href=group.evidencePath;original.target="_blank";original.rel="noopener";original.textContent="打开原尺寸";meta.append(heading,original);const image=document.createElement("img");if(group.comicFormat==="vertical_scroll")image.className="long-evidence";image.src=group.evidencePath;image.alt=group.variantId+" 评审证据";imagePanel.append(meta,image);const items=document.createElement("section");items.className="items-panel";const toolbar=document.createElement("div");toolbar.className="toolbar";const label=document.createElement("strong");label.textContent="本图项目 "+group.items.length+" 个";const bulk=document.createElement("button");bulk.type="button";bulk.className="btn pass";bulk.dataset.action="group-pass";bulk.textContent="本图未判断项全部直接可用";bulk.addEventListener("click",function(){if(!window.confirm("确认已经逐项看过本图，并将所有未判断项目标为直接可用？"))return;group.items.forEach(function(row){if(!decisionValid(row))saved.decisions[row.itemId]={state:"pass",failed:[],notes:""}});persist();render()});toolbar.append(label,bulk);items.append(toolbar);group.items.forEach(function(row){items.append(renderCard(row))});evidence.append(imagePanel,items);root.append(evidence)}
  function render(){document.getElementById("reviewer-id").value=saved.reviewerId||"";document.getElementById("independent").checked=!!saved.independent;renderStats();renderSidebar();renderContent()}
  function csvCell(value){const text=value==null?"":String(value);return/[",\\n\\r]/.test(text)?'"'+text.replaceAll('"','""')+'"':text}
  function exportCsv(){persist();const value=summary();if(value.completed!==value.total||!saved.reviewerId||!saved.independent)return;const rows=[reviewColumns];seed.rows.forEach(function(row){const decision=saved.decisions[row.itemId];const failed=new Set(decision.failed||[]);const values={reviewer_id:saved.reviewerId,review_round:seed.round,variant_id:row.variantId,comic_format:row.comicFormat,item_type:row.itemType,item_id:row.itemId,shot_id:row.shotId,source_text:row.sourceText,adjustment_notes:decision.state==="adjust"?decision.notes:"",evidence_path:row.evidencePath};criteria[row.itemType].forEach(function(entry){values[entry.key]=failed.has(entry.key)?"false":"true"});rows.push(reviewColumns.map(function(column){return values[column]||""}))});const body=rows.map(function(row){return row.map(csvCell).join(",")}).join("\\n")+"\\n";const blob=new Blob([body],{type:"text/csv;charset=utf-8"});const url=URL.createObjectURL(blob);const link=document.createElement("a");link.href=url;link.download="m3-human-review-round-"+seed.round.toLowerCase()+".csv";document.body.append(link);link.click();link.remove();setTimeout(function(){URL.revokeObjectURL(url)},1000)}
  document.getElementById("reviewer-id").addEventListener("input",function(){persist();renderStats()});document.getElementById("independent").addEventListener("change",function(){persist();renderStats()});document.getElementById("export").addEventListener("click",exportCsv);document.getElementById("reset").addEventListener("click",function(){if(!window.confirm("确认清空 ${input.round} 轮全部评审进度？"))return;saved={reviewerId:"",independent:false,current:0,decisions:{}};try{localStorage.removeItem(storageKey)}catch(_error){}render()});render();
  </script>
</body>
</html>`;
}

async function main(): Promise<void> {
  await mkdir(evidenceRoot, { recursive: true });
  await rm(outputRoot, { recursive: true, force: true });
  await mkdir(outputRoot, { recursive: true });
  const corpus = await json(path.join(fixtureRoot, "corpus.manifest.json"));
  const visualFixture = await json(path.join(fixtureRoot, "m3-visual-analysis.fixture.json"));
  const renderer = new LayoutRendererService();
  const outputs: Array<Record<string, unknown>> = [];
  const pagedCards: Array<{ label: string; filePath: string }> = [];
  const verticalCards: Array<{ label: string; filePath: string }> = [];
  const aggregate = emptyAggregate();
  const byFormat = { vertical_scroll: emptyAggregate(), paged_comic: emptyAggregate() };
  const automatedRows: unknown[][] = [reviewHeader,];
  const humanRows: unknown[][] = [reviewHeader,];
  let rendererIdentity: Record<string, unknown> | null = null;

  for (const [variantIndex, entry] of corpus.variants.entries()) {
    const fixture = await json(path.join(fixtureRoot, entry.path));
    const composition = composeVisuallyGuidedLayoutV1(compositionInput(fixture, visualFixture));
    const visibleDocument = projectLayoutDocumentV2ToV1(composition.document);
    const profile = fixture.currentBaseline.publicationProfile as LayoutPublicationProfileV1;
    const renderPlan = buildLayoutRenderPlanV1({
      document: visibleDocument,
      sourceLockSetDigest: fixture.currentBaseline.sourceLockSetDigest,
      profile,
      assets: fixture.currentBaseline.assetManifest,
    });
    const rendered = await renderer.render(renderPlan, profile, await resolvedAssets(fixture));
    rendererIdentity ??= rendered.renderer;
    const variantRoot = path.join(outputRoot, entry.variantId);
    await mkdir(variantRoot, { recursive: true });
    const artifacts: Array<Record<string, any>> = [];
    for (const artifact of rendered.artifacts) {
      const artifactPath = path.join(variantRoot, artifact.fileName);
      await writeFile(artifactPath, artifact.bytes);
      const record = {
        role: artifact.role,
        order: artifact.order,
        relativePath: relativeEvidencePath(artifactPath),
        fileName: artifact.fileName,
        mimeType: artifact.mimeType,
        sha256: artifact.sha256,
        bytes: artifact.bytes.byteLength,
        width: artifact.width,
        height: artifact.height,
        pageCount: artifact.pageCount,
      };
      artifacts.push(record);
      if (artifact.role === "page_png") pagedCards.push({ label: `${entry.variantId} p${artifact.order}`, filePath: artifactPath });
      if (artifact.role === "long_png") verticalCards.push({ label: entry.variantId, filePath: artifactPath });
    }

    const canvasIndex = new Map(composition.document.canvases.map((canvas, index) => [canvas.id, index]));
    const evidenceFor = (canvasId: string): string => {
      if (entry.comicFormat === "vertical_scroll") {
        return artifacts.find((artifact) => artifact.role === "long_png")?.relativePath ?? "";
      }
      const order = (canvasIndex.get(canvasId) ?? 0) + 1;
      return artifacts.find((artifact) => artifact.role === "page_png" && artifact.order === order)?.relativePath ?? "";
    };
    for (const item of composition.report.quality.panels) {
      const row = [
        "automated", "pre_screen", entry.variantId, entry.comicFormat, "panel", item.panelId, item.shotId, "",
        item.layoutOk, item.cropOk, "", "", item.readingOrderOk, item.subjectOcclusionOk, "", "", "",
        item.issues.join("+"), evidenceFor(item.canvasId),
      ];
      automatedRows.push(row);
      humanRows.push(blankHumanReviewRow(row));
    }
    const balloonTextById = new Map(composition.document.canvases.flatMap((canvas) => canvas.elements.flatMap((element) => (
      element.type === "balloon" ? [[element.id, richTextPlainTextV1(element.richText)] as const] : []
    ))));
    for (const item of composition.report.quality.balloons) {
      const row = [
        "automated", "pre_screen", entry.variantId, entry.comicFormat, "required_balloon", item.elementId, item.shotId,
        balloonTextById.get(item.elementId) ?? "",
        "", "", item.balloonGeometryOk, item.balloonTypeOk, "", "", item.textFitOk,
        item.tailOk, item.shapeSafeOk, item.issues.join("+"), evidenceFor(item.canvasId),
      ];
      automatedRows.push(row);
      humanRows.push(blankHumanReviewRow(row));
    }

    outputs.push({
      groupId: entry.groupId,
      variantId: entry.variantId,
      comicFormat: entry.comicFormat,
      mode: composition.mode,
      analysisMode: composition.report.analysisMode,
      visualAnalysisSetDigest: composition.visualAnalysisSetDigest,
      planDigest: composition.planDigest,
      visibleDocumentDigest: composition.visibleDocumentDigest,
      documentDigest: composition.documentDigest,
      compositionDigest: composition.document.automation.composition!.compositionDigest,
      renderPlanDigest: renderPlan.renderPlanDigest,
      selectedStrategy: composition.report.selectedStrategy,
      selectedScore: composition.report.quality.total,
      candidates: composition.candidates.map((candidate) => ({
        strategy: candidate.strategy,
        planDigest: candidate.planDigest,
        score: candidate.score.total,
        repairRounds: candidate.repairRounds,
      })),
      counts: {
        shots: composition.report.shotCoverage.expected,
        placedShots: composition.report.shotCoverage.placed,
        dialogueItems: composition.report.dialogueCoverage.expected,
        placedOriginal: composition.report.dialogueCoverage.placedOriginal,
        canvases: composition.document.canvases.length,
        panels: composition.report.quality.panels.length,
        balloons: composition.report.quality.balloons.length,
        textOverflow: composition.report.textOverflowCount,
        silentRewrite: composition.report.silentRewriteCount,
      },
      quality: composition.report.quality,
      issues: composition.report.issues,
      artifacts,
    });
    addAggregate(aggregate, composition);
    addAggregate(byFormat[entry.comicFormat as keyof typeof byFormat], composition);
    process.stdout.write(`[${variantIndex + 1}/${corpus.variants.length}] ${entry.variantId}: ${artifacts.map((artifact) => artifact.role).join(", ")}\n`);
  }

  const pagedSheet = await pagedContactSheet(pagedCards);
  const verticalSheet = await verticalContactSheet(verticalCards);
  const contactSheets = [
    { kind: "paged", relativePath: relativeEvidencePath(pagedSheet.filePath), width: pagedSheet.width, height: pagedSheet.height, sha256: pagedSheet.sha256, bytes: pagedSheet.bytes },
    { kind: "vertical", relativePath: relativeEvidencePath(verticalSheet.filePath), width: verticalSheet.width, height: verticalSheet.height, sha256: verticalSheet.sha256, bytes: verticalSheet.bytes },
  ];
  await writeFile(path.join(evidenceRoot, "m3-automated-review.csv"), csv(automatedRows), "utf8");
  await writeFile(path.join(evidenceRoot, "m3-human-review-round-a.csv"), csv(humanRows), "utf8");
  await writeFile(path.join(evidenceRoot, "m3-human-review-round-b.csv"), csv(humanRows), "utf8");

  const finalAggregate = finalizeAggregate(aggregate);
  const automatedPassed = finalAggregate.panelDirectUsableRate >= 0.8
    && finalAggregate.balloonDirectUsableRate >= 0.8;
  const unsigned = {
    schemaVersion: 1,
    kind: "smart_layout_m3_visual_composition_outputs_v1",
    corpusDigest: corpus.corpusDigest,
    visualFixtureDigest: visualFixture.fixtureDigest,
    renderer: rendererIdentity,
    status: automatedPassed ? "passed_automated_prescreen_human_review_pending" : "failed_automated_prescreen",
    aggregate: finalAggregate,
    byFormat: {
      vertical_scroll: finalizeAggregate(byFormat.vertical_scroll),
      paged_comic: finalizeAggregate(byFormat.paged_comic),
    },
    outputs,
    contactSheets,
    reviewFiles: {
      automated: "m3-automated-review.csv",
      independentHumanRoundA: "m3-human-review-round-a.csv",
      independentHumanRoundB: "m3-human-review-round-b.csv",
      independentHumanRoundAForm: "m3-human-review-round-a.html",
      independentHumanRoundBForm: "m3-human-review-round-b.html",
      visualReview: "m3-visual-review.md",
    },
    reviewState: {
      deterministicContract: "passed",
      productionRendererOutputs: "generated",
      automatedPrescreen: automatedPassed ? "passed" : "failed",
      agentVisualReview: "completed_original_size_and_contact_sheet",
      independentHumanReviews: "0_of_2_pending",
      releaseGate: "pending_independent_human_reviews",
      statement: "自动评分仅用于预检；M3 的两项 ≥80% 最终门禁必须由两次独立人工盲评确认。",
    },
  };
  const manifest = { ...unsigned, outputManifestDigest: digestCanonicalJson(unsigned) };
  const reviewSeeds = humanReviewSeeds(humanRows);
  await writeFile(
    path.join(evidenceRoot, "m3-human-review-round-a.html"),
    humanReviewPage({ round: "A", outputManifestDigest: manifest.outputManifestDigest, rows: reviewSeeds }),
    "utf8",
  );
  await writeFile(
    path.join(evidenceRoot, "m3-human-review-round-b.html"),
    humanReviewPage({ round: "B", outputManifestDigest: manifest.outputManifestDigest, rows: reviewSeeds }),
    "utf8",
  );
  await writeFile(path.join(evidenceRoot, "m3-visual-output.manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  process.stdout.write(`${JSON.stringify({
    outputManifestDigest: manifest.outputManifestDigest,
    status: manifest.status,
    aggregate: manifest.aggregate,
    byFormat: manifest.byFormat,
    contactSheets: contactSheets.map((sheet) => sheet.relativePath),
  }, null, 2)}\n`);
}

void main();
