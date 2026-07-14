---
doc_id: AIR-CONTRACT-20260711-G5-LAYOUT-DOCUMENT
status: active
created: 2026-07-11
updated: 2026-07-12
owner: AI漫游项目
audience: human, ai-agent, developer, qa
source: ADR-0011、G1 Layout/Export Schema、G3 PageProfile 边界、G4 CandidateLockRevision/Freshness 契约
---

# G5 LayoutDocument 与编辑命令契约字典

## 1. 文档状态与用途

本文是 G5 实施时可直接映射到 Shared types、runtime codec、命令 reducer、Working Copy API、LayoutRevision 投影、fixture 和测试的字段级契约。

- 当前状态为 `accepted`，代表用户接受本契约作为开发基线；功能仍未实现。
- 本文不代表功能已经实现。
- 画布内核、富文本输入层和服务端栅格器仍需通过 E0 原型；任何库的私有 JSON 都不得替代本文。

## 2. 领域词汇

| 用户语言 | 正式名称 | 说明 |
| --- | --- | --- |
| 排版成稿 | `LayoutDocumentV1` | 一章的完整可编辑漫画文档 |
| 页面 / 条漫段落 | `LayoutCanvasV1` | 页漫的一页，或条漫的逻辑段落 |
| 页面规格 | `PageProfileV1` | 页漫统一宽高、安全区和阅读方向 |
| 条漫规格 | `StripProfileV1` | 条漫统一宽度、默认段落高度和安全边距 |
| 画格 | `PanelFrameElementV1` | 矩形/圆角矩形裁切容器与边框 |
| 画格图片 | `PanelImageElementV1` | 归属于一个画格的候选图，不独立占图层 |
| 自由图片 | `FreeImageElementV1` | 可跨格、叠加和自由排序的候选图 |
| 文字 | `TextElementV1` | 标题、旁白、拟声字或自定义文字 |
| 气泡 | `BalloonElementV1` | 受控轮廓、单尾巴与内嵌富文本 |
| 图层 | `elements[]` 顺序 | 从底到顶的顶层对象顺序 |
| 阅读顺序 | `panelReadingOrder[]` | 画格语义顺序，与图层顺序分离 |
| 模板 | `LayoutPresetV1` | 生成同一套正式对象，不是第二套文档 |
| 工作副本 | `LayoutWorkingCopy` | 自动保存、可覆盖的当前草稿 |
| 正式版本 | `LayoutRevision` | 不可变、可被导出引用的快照 |

## 3. 全局编码规则

### 3.1 JSON 与字段

- runtime body 必须是 JSON object；未知字段一律拒绝。
- 不使用 `undefined`、`NaN`、`Infinity`、`-Infinity` 或 JavaScript 私有类型。
- 可空字段必须显式声明；未声明可空的字段不得传 `null`。
- 所有 ID 为去除前后空白后的非空字符串；前缀只用于可读性，不作为安全边界。
- 所有日期、保存时间、用户视口、选区和渲染缓存均不进入 LayoutDocument。

### 3.2 数值规范化

所有可视数值在命令提交时经过 `layout_number_v1`：

```text
坐标、尺寸、圆角、描边、字号、字距：保留 3 位小数
旋转：规范到 [-180, 180)，保留 3 位小数
透明度、比例、lineHeight：保留 3 位小数
-0：规范成 0
```

交互拖动时可使用更高精度，但写入文档前必须量化。量化发生在 Shared command reducer，不能由 Web 与 Server 各写一套。

### 3.3 颜色

- 正式颜色统一为大写八位十六进制 `#RRGGBBAA`。
- 六位输入由 codec 补 `FF`；短十六进制、CSS 颜色名、`rgb()` 和渐变不进入 V1 文档。
- V1 正式出版画布不透明；元素仍可使用 alpha。

### 3.4 数组语义

- `canvases[]` 顺序就是页面/段落顺序。
- `elements[]` 顺序从底到顶，数组下标是唯一图层事实，不再保存 `zIndex`。
- `panelReadingOrder[]` 是画格阅读顺序，不从空间位置或图层顺序临时猜测。
- 字体 fallback 数组按尝试优先级排列，不排序；其他声明为集合的 ID 数组按 Unicode code point 升序。

## 4. LayoutDocumentV1

```ts
export interface LayoutDocumentV1 {
  schemaVersion: 1;
  kind: "layout_document_v1";
  projectId: string;
  chapterId: string;
  comicFormat: "vertical_scroll" | "paged_comic";
  profile: PageProfileV1 | StripProfileV1;
  fontPolicy: LayoutFontPolicyV1;
  canvases: LayoutCanvasV1[];
}
```

根级不保存：

```text
workingCopyId / rowVersion / documentDigest / sourceLockSetDigest
currentLayoutRevisionId / currentExportRevisionId
createdAt / updatedAt / editorVersion / browserVersion
viewport / zoom / pan / selection / activeTool / openPanel
```

这些值分别属于数据库行、查询投影或会话 UI 状态。

### 4.1 根级不变量

1. `projectId/chapterId/comicFormat` 必须与所属数据库作用域一致。
2. `comicFormat=paged_comic` 只能使用 `PageProfileV1` 和 `canvas.kind=page`。
3. `comicFormat=vertical_scroll` 只能使用 `StripProfileV1` 和 `canvas.kind=strip_section`。
4. 文档至少一个 canvas；所有 canvas/顶层元素/内嵌图片 ID 在整份文档内唯一。
5. 同一 active Shot 可出现多次，但每个出现位置必须绑定同一个 CandidateLockRevision 才能创建当前正式版本。
6. 新正式版本要求每个 active Shot 至少有一张当前来源图片；仅在文字或气泡记录 `sourceShotId` 不算已放置图片。

## 5. PageProfile 与 StripProfile

### 5.1 PageProfileV1

```ts
export interface PageProfileV1 {
  kind: "paged";
  presetId: "portrait_3_4" | "landscape_4_3" | "square_1_1" | "custom";
  width: number;
  height: number;
  safeArea: { top: number; right: number; bottom: number; left: number };
  panelReadingDirection: "ltr_ttb" | "rtl_ttb";
}
```

内置默认：

| presetId | width × height | 默认 safeArea | 用途 |
| --- | --- | --- | --- |
| `portrait_3_4` | `1800 × 2400` | 四边 72 | 页漫默认，推荐 |
| `landscape_4_3` | `2400 × 1800` | 四边 72 | 横向场景页 |
| `square_1_1` | `1800 × 1800` | 四边 72 | 方形发布页 |
| `custom` | 用户值 | 用户值 | V1 受范围限制的自定义尺寸 |

- `paged_comic` 不等于横版；默认是竖向 `portrait_3_4`。
- 页面序号始终按 `canvases[]`；V1 不做跨页、对页和装订方向。
- `panelReadingDirection` 只影响模板编号、阅读顺序和辅助预览，不改变文字 writing mode。

### 5.2 StripProfileV1

```ts
export interface StripProfileV1 {
  kind: "vertical_strip";
  presetId: "webtoon_1080" | "custom";
  width: number;
  defaultSectionHeight: number;
  safeInsetX: number;
}
```

内置默认：

```json
{
  "kind": "vertical_strip",
  "presetId": "webtoon_1080",
  "width": 1080,
  "defaultSectionHeight": 1920,
  "safeInsetX": 54
}
```

- 段落之间在编辑器中可显示 UI 间隔，但正式拼接高度为各 canvas.height 之和，不含 UI 间隔。
- `defaultSectionHeight` 只用于新增段落；修改它不回写已有 canvas。
- 手机视窗高度、导出切片高度属于 UI/ExportProfile，不写入 StripProfile。

### 5.3 尺寸范围

```text
page width/height:       320..8192
strip width:             320..4096
strip section height:    320..8192
单 canvas 逻辑面积:      <= 33,554,432
safeArea/safeInsetX:     >= 0 且不能吞掉完整可用区域
```

改 profile 不是普通字段 patch，必须使用 `layout.resize_profile` 命令并预览：

| contentMode | 语义 |
| --- | --- |
| `scale_uniform` | 全部对象按统一比例缩放并居中；文字字号和描边也作为整体迁移显式缩放 |
| `keep_coordinates` | 保留对象坐标/字号，只改变容器；可能产生画布外预检问题 |

命令必须保存迁移后的完整对象结果，不能在将来按新版本算法重算。

## 6. LayoutCanvasV1

```ts
export interface LayoutCanvasV1 {
  id: string;
  kind: "page" | "strip_section";
  name: string;
  width: number;
  height: number;
  backgroundColor: string;
  panelReadingOrder: string[];
  elements: LayoutTopLevelElementV1[];
}
```

- Page 的 width/height 必须等于 PageProfile。
- Strip section 的 width 必须等于 StripProfile.width，height 可逐段调整。
- `backgroundColor` V1 必须 alpha=`FF`。
- `panelReadingOrder` 只能包含本 canvas 的 `panel_frame` ID，每个可见或隐藏画格恰好一次。
- 删除/复制/模板替换画格时，命令必须同事务维护阅读顺序。
- 空 canvas 可存在于 Working Copy 和 LayoutRevision；导出预检至少给出 warning。

## 7. 顶层元素与变换

```ts
export type LayoutTopLevelElementV1 =
  | PanelFrameElementV1
  | FreeImageElementV1
  | TextElementV1
  | BalloonElementV1;

export interface LayoutElementBaseV1 {
  id: string;
  type: "panel_frame" | "free_image" | "text" | "balloon";
  name: string;
  transform: LayoutTransformV1;
  locked: boolean;
  hidden: boolean;
}

export interface LayoutTransformV1 {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  opacity: number;
}
```

变换语义：

1. `x/y` 是未旋转外框左上角。
2. 旋转中心固定为外框中心；V1 不保存自定义 transform origin。
3. 渲染顺序为：定位中心 → 旋转 → 绘制元素局部坐标。
4. width/height 必须大于 0；opacity 为 `0..1`。
5. 允许对象部分或完全在画布外；画布外部分不导出，完全在外产生 warning。
6. `locked` 只影响编辑命中，`hidden` 才影响渲染；两者不影响元素在数组中的位置。
7. V1 只有 normal compositing，不保存 blend mode、滤镜、蒙版或阴影栈。

## 8. CandidateImageSourceV1

所有来自候选图的画格图片和自由图片使用同一来源结构：

```ts
export interface CandidateImageSourceV1 {
  shotId: string;
  candidateId: string;
  candidateLockRevisionId: string;
  assetId: string;
  sourceDigest: string;
}
```

`sourceDigest` 的规范对象固定为：

```ts
interface LayoutImageSourceDigestInputV1 {
  schemaVersion: 1;
  role: "candidate_image";
  shotId: string;
  candidateId: string;
  candidateLockRevisionId: string;
  assetId: string;
  assetSha256: string;
}
```

算法为 RFC 8785 JCS + SHA-256，输出 `sha256:<64 lowercase hex>`。Server 保存 Working Copy 或创建 LayoutRevision 时重新查询 Asset sha 并核对，客户端不能自证来源。

## 9. 画格与画格图片

### 9.1 PanelFrameElementV1

```ts
export interface PanelFrameElementV1 extends LayoutElementBaseV1 {
  type: "panel_frame";
  shape: {
    kind: "rect" | "rounded_rect";
    cornerRadius: number;
  };
  border: {
    visible: boolean;
    color: string;
    width: number;
  };
  contentImage: PanelImageElementV1 | null;
}
```

- `rect` 的 cornerRadius 必须为 0。
- `rounded_rect` 的 cornerRadius 被限制在 `0..min(width,height)/2`。
- 边框向画格内部绘制并最后覆盖在图片上，避免跨渲染器边界漂移。
- 图片与边框共同占一个顶层图层；画格图片不出现在 `elements[]`。
- 这属于正式的“画格—图片所属关系”，不等于通用 Group。

### 9.2 PanelImageElementV1

```ts
export interface PanelImageElementV1 {
  id: string;
  type: "image";
  placement: "panel_content";
  name: string;
  locked: boolean;
  hidden: boolean;
  source: CandidateImageSourceV1;
  crop: CoverCropV1;
}

export interface CoverCropV1 {
  zoom: number;
  offsetX: number;
  offsetY: number;
  rotation: number;
  flipX: boolean;
  flipY: boolean;
}
```

裁切语义：

```text
baseScale = 覆盖旋转后画格所需的最小等比缩放
actualScale = baseScale * zoom
imageCenter = panelCenter + (offsetX, offsetY)
```

- `zoom >= 1`；禁止非等比拉伸。
- 图片围绕自身中心旋转/翻转，再由画格形状裁切。
- Shared geometry 必须校验在当前 rotation/offset 下仍覆盖画格；暴露空洞属于无效 crop，不只是一条 UI warning。
- 替换来源不改变 PanelFrame 的 ID、transform、shape、border 或图层位置。
- crop 迁移只能使用显式 `preserve_normalized_crop` 或 `reset_cover`，不能偷偷套用旧参数。

## 10. 自由图片

```ts
export interface FreeImageElementV1 extends LayoutElementBaseV1 {
  type: "free_image";
  source: CandidateImageSourceV1;
  display:
    | { mode: "contain" }
    | { mode: "cover"; crop: CoverCropV1 };
}
```

- `contain` 显示完整图片，透明留白属于对象内部，不拉伸源图。
- `cover` 使用与画格图片相同的非破坏 crop 规则，裁切范围是自由图片 transform 外框。
- “从画格分离”创建 FreeImage 并删除原 contentImage；“放入画格”创建内嵌图片并删除 FreeImage，二者作为一个可撤销命令。
- 自由图片与其他顶层元素共同参与图层排序、临时多选和批量命令。

## 11. RichTextDocumentV1

```ts
export interface RichTextDocumentV1 {
  schemaVersion: 1;
  writingMode: "horizontal-tb" | "vertical-rl";
  textOrientation: "mixed" | "upright";
  paragraphs: RichTextParagraphV1[];
}

export interface RichTextParagraphV1 {
  align: "start" | "center" | "end";
  lineHeight: number;
  runs: RichTextRunV1[];
}

export interface RichTextRunV1 {
  text: string;
  fontAssetId: string;
  fontSize: number;
  fontWeight: 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900;
  fontStyle: "normal" | "italic";
  color: string;
  letterSpacing: number;
  stroke: null | { color: string; width: number };
}
```

### 11.1 文字规范化

- 输入文本统一 NFC；CRLF/CR 统一为 LF，再按段落拆分。
- NUL 和不可显示控制字符拒绝；Tab 转为四个普通空格。
- 外部 HTML 粘贴只保留纯文本与段落；AI/本站内部富文本必须经过同一 codec，不能直接保存 HTML。
- 相邻且样式完全相同的 run 合并。
- 空 run 删除；空段落保留一个带当前插入样式且 `text=""` 的 run。
- paragraph/run 不保存持久 ID；选择范围只存在 Editor Command 和会话中，避免等价内容因拆 run 方式不同产生不同摘要。
- 正式范围按固定版本 Unicode grapheme segmentation 计数；不能切开 emoji、代理对或组合字符。E0 必须锁定实现与 Unicode policy version。

### 11.2 范围与上限

```text
paragraph lineHeight:   0.8..3
fontSize:               6..512
letterSpacing:          -20..200
text stroke width:      0..64
单文字对象 grapheme:   <= 20,000
整份文档 grapheme:     <= 200,000
```

- V1 不支持 `vertical-lr`、ruby、沿路径文字、弧形/透视文字、逐字 transform 或用户自定义 OpenType feature。
- `vertical-rl` 使用右到左换列；`textOrientation` 只控制竖排中的混合字符方向。
- 字号、字重、斜体必须由受控 FontAsset 明确支持；正式渲染禁止碰巧使用系统字体或未声明 synthetic face。

## 12. TextElementV1

```ts
export interface TextElementV1 extends LayoutElementBaseV1 {
  type: "text";
  semantic: "title" | "caption" | "sfx" | "custom";
  verticalAlign: "start" | "center" | "end";
  richText: RichTextDocumentV1;
}
```

- transform width/height 是排版框，不是 glyph 外接矩形。
- 改文字框尺寸只重排，不默认修改 fontSize。
- 文字超出框时保留完整内容并产生 `TEXT_OVERFLOW`；不能在文档中截短文字冒充修复。
- 拟声字可自由旋转并使用描边，但 V1 不做扭曲、滤镜或逐字位置。

## 13. BalloonElementV1

```ts
export interface BalloonElementV1 extends LayoutElementBaseV1 {
  type: "balloon";
  balloonKind: "speech" | "thought" | "shout" | "caption";
  sourceShotId: string | null;
  speakerCharacterId: string | null;
  fillColor: string;
  strokeColor: string;
  strokeWidth: number;
  padding: { top: number; right: number; bottom: number; left: number };
  verticalAlign: "start" | "center" | "end";
  tail: BalloonTailV1;
  richText: RichTextDocumentV1;
}

export interface BalloonTailV1 {
  enabled: boolean;
  rootRatio: number;
  targetX: number;
  targetY: number;
  baseWidth: number;
}
```

- `rootRatio` 为沿受控轮廓的 `0 <= value < 1` 参数。
- target 使用气泡局部坐标，可在外框外；移动/旋转整个气泡时尾巴随对象一起变换。
- speech 使用平滑尾巴，thought 使用泡泡式尾巴，shout 使用尖角尾巴，caption 默认关闭；算法由 `balloon_shape_v1` 固定。
- speech 为椭圆基形、thought 为固定数量云朵瓣、shout 为固定数量爆发尖角、caption 为圆角矩形；V1 不保存任意 path。
- 内部文字与独立 TextElement 共用 RichTextDocument；改变气泡尺寸只重排，不缩放字号。
- 进入文字编辑模式时只产生文字命令；普通选择时移动的是完整复合对象。

## 14. LayoutFontPolicyV1 与 FontAsset

```ts
export interface LayoutFontPolicyV1 {
  defaultFontAssetId: string;
  fallbackFontAssetIds: string[];
}
```

G5 不新增 Font 数据库模型，复用 G1 `Asset`：

```text
Asset.type = font
Asset.role = layout_font
Asset.mimeType = font/woff2 | font/ttf | font/otf
```

`Asset.metadataJson` 使用 `layout_font_asset_v1`：

```ts
interface LayoutFontAssetMetadataV1 {
  schemaVersion: 1;
  kind: "layout_font_asset_v1";
  familyName: string;
  postScriptName: string;
  faceName: string;
  format: "woff2" | "ttf" | "otf";
  weightMin: number;
  weightMax: number;
  style: "normal" | "italic";
  cmapDigest: string;
  license: {
    spdxId: string | null;
    source: string;
    embeddingAllowed: boolean;
  };
}
```

规则：

- 每个 run 的主 font 必须显式存在；fallback 仅在主字体缺 glyph 时按数组顺序尝试。
- fallback 不能使用客户端系统字体；所有字体必须是 ready Asset 且 sha 可验证。
- 正式出版要求 `embeddingAllowed=true`。
- G5 至少提供一套经许可证复核、包含中日韩常用字符且能覆盖 normal/bold/italic 用户动作的受控字体包；最终字体文件在 E0/许可证复核后确定。
- 项目首次初始化成稿时，通过 Asset/Outbox 正常流程配置项目字体，不把字体 base64 写入 LayoutDocument。
- 系统 emoji 不属于 fallback；缺 glyph 是正式预检错误。

## 15. 文档限制与跨字段不变量

```text
canvases:                     1..200
顶层 elements / canvas:       <= 500
全 document 顶层 elements:    <= 5,000
每个 Panel contentImage:      0..1
规范 JSON UTF-8 bytes:         <= 8 MiB
元素 x/y 绝对值与 width/height: 不超过所属 canvas 最大边的 4 倍
```

必须拒绝：

- 重复 canvas/element/内嵌 image ID。
- `elements[]` 中出现通用 Group、任意 path、滤镜或未知类型。
- `panelReadingOrder` 缺失、重复、跨 canvas 或引用非 PanelFrame。
- contentImage 的 placement 不是 `panel_content`。
- Candidate、LockRevision、Asset、Shot 作用域不一致。
- 同一个 Shot 在文档内同时绑定两个不同 CandidateLockRevision。
- 非 ready Asset、sourceDigest 不匹配、字体未授权嵌入。
- crop 暴露空洞、transform 非法、颜色或数值越界。

## 16. 规范化与摘要

### 16.1 documentDigest

```text
normalized = LayoutDocumentCodecV1.parseAndNormalize(input)
bytes = UTF-8(RFC8785_JCS(normalized))
documentDigest = "sha256:" + lowercaseHex(SHA-256(bytes))
```

JCS 只替代对象键排序，不重排有语义的数组。任何 renderer cache、预检结果、Asset URL、时间戳或本地路径都不得混入 normalized document。

### 16.2 sourceLockSetDigest

- 从 active Shot 的图片来源投影去重后，按 G4 `{shotId,candidateLockRevisionId}` 规则计算。
- 所有 active Shot 都存在且每个 Shot 只有一个 revision 时可产生 digest；缺 Shot、clear 或 unresolved 时为 null。
- Working Copy DB 行保存其当前文档来源 digest；LayoutRevision 保存创建时 digest。
- 新正式版本要求该 digest 与 G4 当前 complete/current lock set digest 一致。

### 16.3 LayoutSourceBinding 投影

遍历顺序固定为：

```text
canvases[] 顺序
  -> elements[] 顺序
    -> PanelFrame.contentImage
    -> FreeImage
```

每个候选图片产生：

```ts
interface LayoutSourceBindingProjectionV1 {
  elementId: string;
  role: "candidate_image";
  order: number;
  shotId: string;
  candidateId: string;
  candidateLockRevisionId: string;
  assetId: string;
  sourceDigest: string;
}
```

panel_frame 使用 `contentImage.id` 作为 elementId，free_image 使用顶层 element.id；candidate_image 按上述遍历顺序从 1 连续编号。关系层同时唯一 `(layoutRevisionId,elementId,role)` 与 `(layoutRevisionId,role,order)`，精确 JSON path/legacy envelope 见 G1 实施契约 11.3.1。

G4 已采纳的 Working Copy impact projector 对外字段名仍是 `sourceCandidateLockRevisionId`；G5 文档内的 `source.candidateLockRevisionId` 必须确定性映射到该字段，不能把命名差异解释为两份来源。

正式保存时同事务按固定顺序写 `unsealed LayoutRevision → LayoutSourceBinding[] → bindingSetSealedAt → Chapter.currentLayoutRevisionId → WorkingCopy.basedOnRevisionId`。Projection 不能独立写入或在数据库中手工修补。

## 17. LayoutPresetV1

V1 内置 catalog：

| presetId | 画格数 | 适用 | 说明 |
| --- | ---: | --- | --- |
| `single` | 1 | 条漫/页漫 | 单一大画格 |
| `two_vertical` | 2 | 条漫/页漫 | 上下排列 |
| `two_horizontal` | 2 | 页漫为主 | 左右排列 |
| `three_focus` | 3 | 条漫/页漫 | 一大两小 |
| `four_panel` | 4 | 页漫为主 | 四格模板，不是 Project.comicFormat |
| `dialogue_two` | 2 | 条漫/页漫 | 对话双格与留白 |
| `action_focus` | 3 | 条漫/页漫 | 主动作大格 + 两个补充格 |

规则：

- catalog 记录 `presetVersion`；应用后保存生成的正式 PanelFrame，不依赖未来 catalog 重算。
- 新建 Working Copy：页漫默认每页 `four_panel`，最后一页按剩余 1/2/3 镜头使用对应模板；条漫默认一镜一段 `single`。
- 模板只改画格与画格内图片；Text/Balloon/FreeImage 不静默删除或重排。
- 新模板画格少于当前已占用画格时阻止应用，用户需先把图片分离/删除或选足够画格的模板。
- 应用到已有图片必须显示画格映射和每张图 crop 结果；命令保存明确的新 PanelFrame 与图片映射。
- G3 legacy `layoutPresetIntent=four_panel` 只在首个 Working Copy 初始化时消费一次。

## 18. Editor Command 总约束

```ts
export interface EditorCommandV1<TType extends EditorCommandType, TPayload> {
  schemaVersion: 1;
  commandId: string;
  type: TType;
  label: string;
  payload: TPayload;
}

export interface EditorCommandBatchV1 {
  schemaVersion: 1;
  batchId: string;
  label: string;
  commands: EditorCommandV1<EditorCommandType, unknown>[];
}
```

- Command 是纯函数输入；`apply(document, command)` 返回规范化 next document、inverse command、changedElementIds 和 invalidatedPreflightScopes。
- `commandId/batchId/label/inverse` 不进入 LayoutDocument。
- batch 全部成功或全部失败；AI 建议、模板、批量 stale 替换和多选变换都必须作为一次 Undo。
- 命令不能读取当前时间、随机数、DOM、网络或系统字体；新 ID 在创建 command 前生成并写入 payload。
- 需要算法结果的命令保存完整结果，不只保存“使用某个模板/自动适配”这种未来会漂移的意图。

## 19. V1 命令类型

### 19.1 画布与 profile

```text
canvas.add
canvas.duplicate
canvas.delete
canvas.reorder
canvas.resize
layout.resize_profile
```

- delete 最后一个 canvas 被拒绝。
- duplicate 需要为 canvas、顶层元素和内嵌图片提供完整新 ID map。
- resize/profile 命令必须携带迁移后全部受影响 transform/rich-text style 数值，便于确定性 Undo。

### 19.2 顶层对象

```text
element.add
element.duplicate
element.delete
element.reorder
element.set_transform
element.set_locked
element.set_hidden
```

- reorder payload 使用目标 canvas、elementId 和 `beforeElementId|null`，Server/Shared 规范化为数组顺序。
- 删除 occupied PanelFrame 会同时删除其内嵌 Image；UI 必须确认并展示对应 Shot 将变为未放置。
- locked 元素仍可由明确的“解锁”命令修改；其他变换命令遇 locked 必须失败。

### 19.3 画格与图片

```text
panel.set_shape
panel.set_border
panel.attach_image
panel.detach_image_to_free
image.set_display
image.set_crop
image.replace_source
```

- attach/detach/replace 是复合命令，必须包含完整来源与结果 crop。
- replace_source 不能只传 candidateId；必须传 Shot/Candidate/LockRevision/Asset/sourceDigest 的完整权威结果。

### 19.4 富文本与气泡

```text
text.replace_range
text.apply_range_style
text.set_paragraph_style
text.replace_document
text.set_semantic
balloon.set_kind
balloon.set_visual_style
balloon.set_tail
balloon.set_source_refs
balloon.replace_text_document
```

范围位置：

```ts
interface RichTextPositionV1 {
  paragraphIndex: number;
  graphemeOffset: number;
}
```

- range 为 `[start,end)`，按固定 grapheme policy；start/end 必须落在合法边界。
- `compositionstart` 到 `compositionend` 期间不落命令；结束后合成一个 replace_range。
- 外部粘贴清洗后作为一个 replace_range；内部富文本粘贴作为一个 batch。

### 19.5 批量命令

```text
batch.transform
batch.align
batch.distribute
batch.reorder
batch.set_locked
batch.set_hidden
batch.delete
layout.apply_preset
layout.replace_sources
```

- SelectionSet 只在会话内；batch payload 保存每个元素的明确 after value，不保存 Group。
- 拖动过程中只更新预览状态，pointerup 后产生一个 command；不得每个 pointermove 写一条历史或触发一次保存。

## 20. Undo/Redo 与会话恢复

- Undo/Redo 是浏览器会话级 command history，不写数据库。
- 默认保留最近 200 个 batch 或 50 MiB inverse snapshot，以先到任一上限为准。
- 连续拖动、键盘微调的短时间 coalescing 只能在同一元素集合和同一命令类型内发生。
- 自动保存不会清空 Undo；正式保存 LayoutRevision 也不清空。
- 页面刷新、章节切换、历史版本恢复或并发冲突解决后，Undo/Redo 清空并明确提示。
- Undo 可以把 Working Copy 恢复成 stale/overflow 状态；后续正式保存和导出门禁仍会阻止错误产物。

## 21. Working Copy 生命周期

### 21.1 初始化

```text
POST /api/projects/{projectId}/chapters/{chapterId}/layout/working-copy/initialize
```

Request：

```ts
interface InitializeLayoutWorkingCopyRequestV1 {
  schemaVersion: 1;
  profile: PageProfileV1 | StripProfileV1;
  initializationMode: "default_storyboard_layout" | "blank";
  expectedCurrentLayoutRevisionId: string | null;
}
```

门禁：

- project comicFormat 已锁定。
- G4 lock set 必须 complete/current。
- 每个 Candidate/Asset ready，项目受控字体已 provision ready。
- 已有 `layout_document_v1` Working Copy 时返回现有内容，不重复初始化。
- `blank` 允许 Working Copy 临时不放 Shot，但无法创建当前正式版本。

### 21.2 查询

```text
GET /api/projects/{projectId}/chapters/{chapterId}/layout/working-copy
```

```ts
interface LayoutWorkingCopyResponseV1 {
  schemaVersion: 1;
  id: string;
  projectId: string;
  chapterId: string;
  document: LayoutDocumentV1;
  documentDigest: string;
  sourceLockSetDigest: string | null;
  basedOnRevisionId: string | null;
  rowVersion: number;
  saveState: "saved";
  sourceEvaluation: LayoutSourceEvaluation;
  updatedAt: string;
}
```

### 21.3 自动保存

```text
PUT /api/projects/{projectId}/chapters/{chapterId}/layout/working-copy
```

```ts
interface SaveLayoutWorkingCopyRequestV1 {
  schemaVersion: 1;
  expectedRowVersion: number;
  baseDocumentDigest: string;
  documentDigest: string;
  document: LayoutDocumentV1;
}
```

Server 顺序：作用域 → body codec → normalize → client digest 核对 → rowVersion/base digest → Asset/source/font 解析与来源投影 → 计算 source lock set → 更新。

Working Copy 是修复空间，不能因外部状态后来变成 stale/missing 就拒绝保存用户其他编辑：

- 文档中未改变的旧 source/font 引用允许继续保存，并在查询/预检中派生 stale/unresolved/missing。
- 新增或改变 Candidate/Asset/Font 引用时必须由 Server 证明同作用域、ready、摘要正确；客户端不能制造未知引用。
- autosave 不要求来源 current；只有初始化新来源、创建正式 LayoutRevision 和导出使用严格 current/readiness gate。

Response result：

```text
updated   rowVersion + 1
no_op     当前 digest 相同，不更新 rowVersion/updatedAt
replayed  当前 rowVersion = expected + 1 且当前 digest = 请求 digest
```

其他情形返回 409，不自动 merge 或覆盖。

### 21.4 浏览器保存节奏

```text
idle debounce: 800ms
max dirty wait: 5s
必须 flush: pointerup、compositionend、章节/路由离开、visibilitychange=hidden、正式保存、预检、导出
beforeunload: flush 未确认完成时显示浏览器离开警告
```

断网/失败时保留本地内存文档并显示“未保存”；允许下载规范 JSON 恢复副本。V1 不把 IndexedDB 变成第二业务事实源。

### 21.5 多标签冲突

- 409 后暂停自动保存，不静默 last-write-wins。
- UI 展示服务端 updatedAt/digest 与本地未保存状态。
- 用户可下载本地恢复 JSON后选择“重新加载服务端”或“明确保留本地并基于最新 rowVersion 再提交”。
- 保留本地仍需重新获取最新行并在短事务中比较 rowVersion；再次变化继续冲突。
- V1 不实现对象级自动合并或多人实时协作。

## 22. LayoutRevision

### 22.1 G1 Schema 细化

G1 base 已预建，G5 开始正式使用：

```text
previousRevisionId
contentBasedOnRevisionId
saveReason
bindingSetSealedAt
```

字段总览：

```text
id, projectId, chapterId, revision,
previousRevisionId, contentBasedOnRevisionId,
documentJson, schemaVersion, documentDigest, sourceLockSetDigest,
origin, saveReason, bindingSetSealedAt, createdAt
```

枚举：

```text
origin = runtime | legacy_import
saveReason = user_checkpoint | export_checkpoint | history_restore | legacy_import
```

- `previousRevisionId` 指向保存前 Chapter current LayoutRevision，形成线性 current 时间线。
- `contentBasedOnRevisionId` 来自 WorkingCopy.basedOnRevisionId，可指历史修订，表达“内容从哪里恢复”。
- runtime 首版 revision 的 previous 可为 null；之后必须等于保存事务开始时 current。
- 创建事务固定为“unsealed Revision → LayoutSourceBinding[] → 单向写 bindingSetSealedAt → 切 current”，禁止 INSERT 时预填 seal；空 canvas/纯文字文档允许 0 条 Binding，含 source-backed 元素时必须与 codec 投影精确一致。seal 后文档、来源与 Binding 集合不可变，杜绝以后晚插入。
- 对 runtime previous 设置唯一约束，禁止 detached branch。该唯一/线性/current 状态机是 G5 overlay；字段和 seal 基础门禁属 G1 base，不重复 ADD COLUMN。
- G5-M6 的 0014 只替换 G1 `LayoutSourceBinding` insert trigger 中“`sourceDigest == Asset.sha256`”这一矛盾条件：`sourceDigest` 实际是 Shot/Candidate/LockRevision/Asset ID 与 Asset sha 的复合摘要。scope、unsealed、Candidate/LockRevision、ready Asset、sha 非空和 seal 后不可变门禁全部保留。

### 22.2 创建正式版本

```text
POST /api/projects/{projectId}/chapters/{chapterId}/layout/revisions
```

```ts
interface CreateLayoutRevisionRequestV1 {
  schemaVersion: 1;
  expectedWorkingCopyRowVersion: number;
  expectedDocumentDigest: string;
  expectedCurrentRevisionId: string | null;
  saveReason: "user_checkpoint" | "export_checkpoint" | "history_restore";
  acknowledgedIssueKeys: string[];
}
```

事务：

1. 读取并核对 Working Copy rowVersion/digest。
2. 核对 expected current，先识别精确 replay。
3. 运行 document/source/font/integrity revision gate。
4. `revision=max+1`，插入 `bindingSetSealedAt=null` 的 LayoutRevision；禁止 INSERT 时预填 seal。
5. 投影并插入 LayoutSourceBinding。
6. 重新核对投影计数、字段和 Candidate/Lock/Asset provenance chain 后，单向写 `bindingSetSealedAt`；这一步之后 Revision/Bindings 不可改。
7. 更新 Chapter.currentLayoutRevisionId；current 只能指向已 sealed revision。
8. 更新 WorkingCopy.basedOnRevisionId 为新修订并递增 rowVersion。

精确 replay：当前 LayoutRevision 的 previous 等于 request expected、documentDigest/saveReason 等于请求，Working Copy 恰为 expected rowVersion+1、documentDigest 相同且 basedOn 指向该 revision；返回现有修订，不再插入。

`acknowledgedIssueKeys` 只能包含本次重新计算的 preflight report 中 `requiresAcknowledgement=true` 的 issueKey。缺少必需确认、重复 key 或提交不属于当前 report 的 key 都拒绝；客户端不能拿旧 preflight 的确认跳过新问题。

正式版本门禁：

- 必须完整放置所有 active Shot，且来源 complete/current。
- 候选图片 Asset、受控字体和 glyph 必须可解析、ready、作用域正确。
- schema/crop/尺寸必须有效。
- `TEXT_OVERFLOW`、低分辨率、画布外对象和空页面允许保存检查点，但返回 warning；正式导出仍可阻断或要求确认。

离开编辑器只 flush Working Copy，不自动创建 LayoutRevision。正式版本只在用户点击“保存版本”、恢复历史后确认保存或导出前“保存新版本并导出”时创建，避免拖动会话制造版本噪声。

### 22.3 历史查询与恢复

```text
GET  /api/projects/{projectId}/chapters/{chapterId}/layout/revisions
GET  /api/projects/{projectId}/chapters/{chapterId}/layout/revisions/{revisionId}
POST /api/projects/{projectId}/chapters/{chapterId}/layout/revisions/{revisionId}/restore-to-working-copy
```

恢复请求必须带 `expectedWorkingCopyRowVersion/expectedWorkingCopyDigest`，先预览将覆盖的未保存内容。恢复只替换 Working Copy 并设置 basedOn，不移动 Chapter current 指针、不改历史、不自动新建正式版本。历史来源已 stale 时恢复后的草稿显示 stale，解决后才能再次保存 current revision。

## 23. 来源 stale/unresolved 解决

### 23.1 预览

```text
POST /api/projects/{projectId}/chapters/{chapterId}/layout/source-replacements/preview
```

```ts
interface PreviewLayoutSourceReplacementRequestV1 {
  schemaVersion: 1;
  expectedWorkingCopyRowVersion: number;
  expectedDocumentDigest: string;
  replacements: Array<{
    imageElementId: string;
    cropMode: "preserve_normalized_crop" | "reset_cover";
  }>;
}
```

Server 只以每个 Shot 当前 finalized Candidate 为目标，返回：

```ts
interface LayoutSourceReplacementPreviewV1 {
  schemaVersion: 1;
  policyVersion: "layout_source_replace_v1";
  expectedWorkingCopyRowVersion: number;
  expectedDocumentDigest: string;
  replacementDigest: string;
  resultDocumentDigest: string;
  items: Array<{
    imageElementId: string;
    from: CandidateImageSourceV1;
    to: CandidateImageSourceV1;
    cropMode: "preserve_normalized_crop" | "reset_cover";
    resultCrop: CoverCropV1 | null;
    cropCompatibility: "compatible" | "review_required";
    warningCodes: string[];
  }>;
}
```

- `preserve_normalized_crop` 将 offset 按目标框宽高归一化迁移并重新验证 coverage。
- `reset_cover` 使用 zoom=1、offset=0、rotation=0、flip=false。
- 批量替换逐项保存明确 cropMode；UI 可推荐但不能暗中决定。
- 当前锁已 clear/unset、Candidate/Asset 未 ready 或来源再次变化时 preview/commit 阻止，返回用户去候选图阶段处理。

### 23.2 提交

```text
POST /api/projects/{projectId}/chapters/{chapterId}/layout/source-replacements/commit
```

Request 在 preview body 基础上增加 `replacementDigest`。Server 在写事务中重算目标来源、crop 结果和 digest；一致才更新 Working Copy，递增 rowVersion。它不创建 LayoutRevision、不改旧 Layout/Export、不移动当前 Export 指针。

Web 将一次成功替换记录成一个受限 Editor Command history batch：inverse 是提交前 Working Copy snapshot，forward 是明确的 `layout.replace_sources`；一次 Undo 会保存回 stale Working Copy，一次 Redo 会恢复 current。Undo/Redo 都不改旧 Revision/Export/Asset。

丢响应重试：当前 rowVersion 恰为 expected+1 且 documentDigest 等于 preview.resultDocumentDigest 时返回 `replayed`；之后的任何编辑都会打断 replay。

## 24. PendingEditorCommandSet

不新增第 45 个模型，扩展 G1 `PendingDialogueArtifact.kind`：

```text
kind += layout_editor_command_set
activeSlotKey = layout-command:{chapterId}
```

Payload：

```ts
interface PendingEditorCommandSetV1 {
  schemaVersion: 1;
  workingCopyId: string;
  expectedRowVersion: number;
  baseDocumentDigest: string;
  sourceLockSetDigest: string | null;
  selectionElementIds: string[];
  summary: string;
  changedElementIds: string[];
  warnings: string[];
  commandBatch: EditorCommandBatchV1;
  resultDocumentDigest: string;
}
```

规则：

- AI 只读取最近一次成功保存的 Working Copy，不读取尚未 autosave 的本地状态。
- Server 使用 Shared reducer 预演 commandBatch 后才写 pending，不能保存任意 JSON Patch 或脚本。
- UI 显示 before/after、影响对象和预检变化；放弃只把 pending 标记 discarded。
- 应用前先 flush 本地，Server 再核对 rowVersion/base/source digest；任何变化返回 expired/conflict，必须重新生成预览。
- apply 在事务中更新 Working Copy 并把 pending 标为 applied；返回的 batch 在浏览器会话中作为一次可撤销操作。
- AI apply 不创建 LayoutRevision、不创建 ExportRevision、不跳过 stale 或预检。

## 25. 查询投影

编辑器 bootstrap 至少返回：

```ts
interface LayoutEditorBootstrapV1 {
  schemaVersion: 1;
  project: { id: string; comicFormat: "vertical_scroll" | "paged_comic" };
  chapter: { id: string; title: string; activeShotIds: string[] };
  workingCopy: LayoutWorkingCopyResponseV1 | null;
  currentLayoutRevisionId: string | null;
  currentExportRevisionId: string | null;
  sourceEvaluation: LayoutSourceEvaluation | null;
  shotTray: LayoutShotTrayItemV1[];
  fontAssets: LayoutFontAssetDtoV1[];
  layoutPresets: LayoutPresetDtoV1[];
  permissions: {
    canEdit: boolean;
    canSaveRevision: boolean;
    canExport: boolean;
    readOnlyReasonCodes: string[];
  };
}
```

Shot tray 状态：

```text
unplaced | placed_current | placed_multiple | placed_stale | unresolved | lock_missing
```

这些都是查询投影，不写入 LayoutDocument。

## 26. HTTP 错误字典

| HTTP | code | 触发 |
| --- | --- | --- |
| 400 | `LAYOUT_BODY_INVALID` | body/字段类型错误 |
| 400 | `LAYOUT_UNKNOWN_FIELD` | 含契约外字段 |
| 400 | `LAYOUT_DOCUMENT_KIND_INVALID` | 非 layout_document_v1 |
| 400 | `LAYOUT_DOCUMENT_TOO_LARGE` | JSON/对象/文本超上限 |
| 400 | `LAYOUT_NUMBER_INVALID` | 非法/越界数值 |
| 400 | `LAYOUT_COLOR_INVALID` | 非规范颜色 |
| 400 | `LAYOUT_ID_DUPLICATED` | canvas/element/image ID 重复 |
| 400 | `LAYOUT_PROFILE_FORMAT_MISMATCH` | profile 与 comicFormat 不符 |
| 400 | `LAYOUT_CANVAS_INVALID` | canvas 结构/尺寸/类型错误 |
| 400 | `LAYOUT_READING_ORDER_INVALID` | panelReadingOrder 缺失/重复/跨域 |
| 400 | `LAYOUT_ELEMENT_INVALID` | 元素判别联合错误 |
| 400 | `LAYOUT_CROP_INVALID` | crop 暴露空洞或越界 |
| 400 | `LAYOUT_RICH_TEXT_INVALID` | 富文本/范围/IME 结果不合法 |
| 400 | `LAYOUT_FONT_REFERENCE_INVALID` | run/font policy 引用错误 |
| 400 | `LAYOUT_COMMAND_INVALID` | command/payload 非法 |
| 400 | `LAYOUT_COMMAND_TARGET_MISSING` | 命令目标不存在 |
| 400 | `LAYOUT_COMMAND_TARGET_LOCKED` | 对 locked 元素执行修改 |
| 400 | `LAYOUT_LAST_CANVAS_REQUIRED` | 删除最后 canvas |
| 400 | `LAYOUT_PRESET_MAPPING_BLOCKED` | 模板画格不足或映射未确认 |
| 404 | `LAYOUT_WORKING_COPY_NOT_FOUND` | 当前章无工作副本 |
| 404 | `LAYOUT_REVISION_NOT_FOUND` | 修订不存在/越作用域 |
| 409 | `LAYOUT_WORKING_COPY_EXISTS` | 初始化时已有不兼容副本 |
| 409 | `LAYOUT_WORKING_COPY_CONFLICT` | rowVersion/base digest 已变化 |
| 409 | `LAYOUT_DOCUMENT_DIGEST_MISMATCH` | client digest 与规范文档不符 |
| 409 | `LAYOUT_COMIC_FORMAT_IMMUTABLE` | 文档 format 与项目锁定值不符 |
| 409 | `LAYOUT_LOCK_SET_INCOMPLETE` | active Shot 未全部 finalized/放置 |
| 409 | `LAYOUT_SOURCE_STALE` | 存在旧 lock revision |
| 409 | `LAYOUT_SOURCE_UNRESOLVED` | 来源无法解析 |
| 409 | `LAYOUT_SOURCE_DIGEST_MISMATCH` | source/lock set 摘要不一致 |
| 409 | `LAYOUT_SOURCE_CHANGED` | 替换 preview 后来源变化 |
| 409 | `LAYOUT_SOURCE_REPLACEMENT_PREVIEW_MISMATCH` | 替换来源、crop 或摘要已变化 |
| 409 | `LAYOUT_EXPECTED_CURRENT_REVISION_MISMATCH` | current LayoutRevision 已变化 |
| 409 | `LAYOUT_REVISION_PREFLIGHT_BLOCKED` | 不满足正式保存完整性门禁 |
| 409 | `LAYOUT_PREFLIGHT_ACKNOWLEDGEMENT_REQUIRED` | 必需 warning 未逐项确认 |
| 409 | `LAYOUT_PREFLIGHT_ACKNOWLEDGEMENT_INVALID` | 确认 key 不属于当前 preflight report |
| 409 | `LAYOUT_PENDING_COMMAND_EXPIRED` | AI 建议 base/source 已变化 |
| 422 | `LAYOUT_ASSET_NOT_READY` | 候选图 Asset 不可用于正式文档 |
| 422 | `LAYOUT_FONT_NOT_READY` | 字体缺失/未 ready/不可嵌入 |
| 422 | `LAYOUT_FONT_GLYPH_MISSING` | 受控字体链缺 glyph |
| 413 | `LAYOUT_REQUEST_TOO_LARGE` | HTTP body 超硬限制 |

错误响应沿用项目统一 envelope，不能返回 prompt、完整文档、字体文件路径、Asset 绝对路径或凭据。

## 27. 旧 ChapterLayout V1 迁移

### 27.1 可解析旧数据

当旧 placement 能映射到 G4 current CandidateLockRevision 且 Asset ready：

- 页漫：旧 page 转为 custom PageProfile；每个 placement 转 PanelFrame + contentImage。
- 条漫：旧 page 转 strip_section；保持顺序和逻辑尺寸。
- `page_horizontal/four_panel/vertical_comic` 只由带 `Legacy` 命名的 migration adapter 读取。
- 原始 metadata 继续保存在 G1 只读档案；新 runtime 不双写旧 layout.json。
- 转换只创建/替换 Working Copy，不自动创建 runtime LayoutRevision；用户预览并保存后才成为 current。

### 27.2 unresolved 旧数据

- 保持只读旧预览并显示 `legacy_unresolved`。
- 用户可明确选择“使用当前定稿重新建立成稿草稿”；原始旧数据仍在迁移档案与 provenance 记录中。
- 不把缺 CandidateLockRevision 的 placement 猜成 current，不允许普通 runtime 回填历史来源。

### 27.3 删除旧契约的闸门

以下全部满足后删除旧 `ChapterLayout/LayoutPage/PanelPlacement` runtime DTO 和复制源图导出：

1. 所有现存 layout row 已转换或被用户明确重建。
2. DB 查询不再返回 legacy documentKind 给编辑写路径。
3. G0 legacy read witness 与 G5 migration tests 通过。
4. 新 PNG 出版链路已 green，不能先删旧读路径再留下无导出能力。

## 28. 完整最小示例

```json
{
  "schemaVersion": 1,
  "kind": "layout_document_v1",
  "projectId": "project_001",
  "chapterId": "chapter_001",
  "comicFormat": "paged_comic",
  "profile": {
    "kind": "paged",
    "presetId": "portrait_3_4",
    "width": 1800,
    "height": 2400,
    "safeArea": { "top": 72, "right": 72, "bottom": 72, "left": 72 },
    "panelReadingDirection": "ltr_ttb"
  },
  "fontPolicy": {
    "defaultFontAssetId": "asset_font_regular",
    "fallbackFontAssetIds": ["asset_font_cjk_fallback"]
  },
  "canvases": [
    {
      "id": "canvas_001",
      "kind": "page",
      "name": "第 1 页",
      "width": 1800,
      "height": 2400,
      "backgroundColor": "#FFFFFFFF",
      "panelReadingOrder": ["panel_001"],
      "elements": [
        {
          "id": "panel_001",
          "type": "panel_frame",
          "name": "镜头 1",
          "transform": { "x": 72, "y": 72, "width": 1656, "height": 1800, "rotation": 0, "opacity": 1 },
          "locked": false,
          "hidden": false,
          "shape": { "kind": "rect", "cornerRadius": 0 },
          "border": { "visible": true, "color": "#111111FF", "width": 8 },
          "contentImage": {
            "id": "image_001",
            "type": "image",
            "placement": "panel_content",
            "name": "镜头 1 定稿",
            "locked": false,
            "hidden": false,
            "source": {
              "shotId": "shot_001",
              "candidateId": "candidate_001",
              "candidateLockRevisionId": "lockrev_001",
              "assetId": "asset_candidate_001",
              "sourceDigest": "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
            },
            "crop": { "zoom": 1, "offsetX": 0, "offsetY": 0, "rotation": 0, "flipX": false, "flipY": false }
          }
        },
        {
          "id": "balloon_001",
          "type": "balloon",
          "name": "主角对白",
          "transform": { "x": 980, "y": 180, "width": 620, "height": 420, "rotation": 0, "opacity": 1 },
          "locked": false,
          "hidden": false,
          "balloonKind": "speech",
          "sourceShotId": "shot_001",
          "speakerCharacterId": "character_001",
          "fillColor": "#FFFFFFFF",
          "strokeColor": "#111111FF",
          "strokeWidth": 8,
          "padding": { "top": 48, "right": 56, "bottom": 48, "left": 56 },
          "verticalAlign": "center",
          "tail": { "enabled": true, "rootRatio": 0.55, "targetX": 80, "targetY": 500, "baseWidth": 42 },
          "richText": {
            "schemaVersion": 1,
            "writingMode": "horizontal-tb",
            "textOrientation": "mixed",
            "paragraphs": [
              {
                "align": "center",
                "lineHeight": 1.35,
                "runs": [
                  {
                    "text": "我们马上离开这里。",
                    "fontAssetId": "asset_font_regular",
                    "fontSize": 48,
                    "fontWeight": 400,
                    "fontStyle": "normal",
                    "color": "#111111FF",
                    "letterSpacing": 0,
                    "stroke": null
                  }
                ]
              }
            ]
          }
        }
      ]
    }
  ]
}
```

## 29. 静态复核关注点

- 没有把 Project.comicFormat、PageProfile、文字 writingMode 和 LayoutPreset 混成同一字段。
- 没有把画布库节点、DOM、HTML、selection、viewport 或 Undo history 写进正式文档。
- 画格图片是受控所属关系，自由图片才独立排序；一般 Group 仍未进入 V1。
- source binding 能投影到 G1/G4 的关系表和 lock set digest，不依赖旧 `lockedCandidateId`。
- Working Copy、LayoutRevision 和历史恢复的写权限及并发边界分离。
- AI 建议使用现有 PendingDialogueArtifact 扩展，不新增平行 pending 真值。
- 字体复用 Asset，并以明确 metadata/sha/license 阻止系统字体漂移。
