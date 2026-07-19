---
doc_id: AIR-TASK-20260719-CANDIDATE-REFERENCE-COMPILER-FINDINGS
status: completed
created: 2026-07-19
updated: 2026-07-19
owner: AI漫游项目
audience: human, ai-agent, developer, qa
source: 代码库探索与多角色平台调研
---

# 候选图必需引用编译 P0 发现

## 实施前已确认事实

1. 当前共享候选引用只有 `character_identity` 与 `scene_environment`，并以 `priority` 表达顺序，没有必需性和覆盖证据。
2. `ImageProviderService` 当前对 Grok 超过三张引用时固定保留两个角色与一个场景；被省略角色只进入 warning。只有一张 Grok 引用时则完全舍弃图片、退回文生图。
3. OpenAI 和 Doubao 本地适配上限分别为 16 和 10；容量内无需为了统一形式主动压缩角色图片。
4. 文件兼容路径使用镜头的单人 `previewReferenceAssetId`；DB-only 出图准备快照可能选到 `final_reference`，需继续核对并避免完整四视图直接进入候选图编辑。
5. 角色资产主要是 WebP；当前直接依赖只有 `pngjs`，不能完成通用 WebP/JPEG 解码、归一化裁切和合成。
6. 当前 `comic.composition` 为自由文本，无法可靠生成逐角色站位图；P0 只能如实保留为 Prompt 约束。
7. 两条候选生成路径最终都经过 `ImageProviderService`，因此在 Provider 边界实施统一编译可避免双实现漂移。
8. xAI 2026-05-26 更新的官方文档要求单图编辑使用 JSON `image`，多图编辑使用 `images`（至少两张、最多三张）；单图编辑输出比例跟随输入，多图编辑才可用 `aspect_ratio` 覆盖。
9. `sharp@0.35.3` 支持当前 Node 22，并可在现有 macOS arm64 环境解码/编码 WebP；工作区此前没有可直接使用的通用图片解码合成依赖。

## 风险

- 身份板解决的是“每个角色的身份条件被送达”，不是模型一定能在复杂动作中正确绑定角色；真实视觉质量仍需固定样例 A/B。
- 机械 `contain` 不做面部检测，能避免误裁，但源图留白可能降低有效身份像素；P0 需以固定单元最小尺寸和输入损坏硬门止损。
- 若 DB-only 源快照只有完整四视图，简单打包会放大拼贴污染；必须优先冻结单人预览，无法满足时失败关闭。
- 确定性图片依赖的编码器版本会影响字节摘要；实现应记录布局版本、输出尺寸和最终摘要。

## 实施结论

- Provider 结果证据已落到文件兼容候选 Asset 元数据/任务输出，以及 DB-only Candidate Asset metadata v2/任务输出。
- 直接依赖已锁定为 `sharp@0.35.3`，本地解码、缩放/留白、合成和确定性摘要测试通过。
- Grok 单图不能使用多图 `images` 形式；已按官方合同改用单图 `image` 请求，并显式记录比例跟随输入的限制。
- DB-only 四视图不再直接进入候选生成：任务创建冻结与 final 有精确来源关系的 `preview_front` 单人锚点，同时把 final 与 preview 两条 CharacterVisual 写入任务来源投影；旧任务只指向四视图时在联网前失败。
- `CharacterVisual.sourceVisualId` 原先没有记录 final 实际由哪张 preview 生成；这会在 preview 后续更新时产生身份错配风险。现已让新 final 保存精确来源，并让候选任务优先沿来源取 preview；旧空来源资产只有唯一一张版本更早且仍可用的 preview 时才兼容，多解或无解失败关闭。

## 真实素材运行发现

- 标准 DB 的三人镜头 `shot_6e2394d093f90f395f8167fb405d7930` 绑定阿肃、铁锚、小棠和 `scene_01`；三人的 preview 与 final、场景 Asset 均为 ready WebP。
- 三张真实 `final_reference` 尺寸同为 864×1152，但阿肃/小棠为横向四视图，铁锚为 2×2 四视图。模型输出没有遵守单一排版，因此不能通过尺寸或 Prompt 版本推断固定裁切格位。
- 三张真实 `preview_front` 均是单人正面身份图。使用它们和真实场景离线编译 Grok 计划，结果为 2 个物理输入、角色板 2016×944、顺序“阿肃→铁锚→小棠”、全部 4 个原始 Asset 覆盖、`omittedRequired=[]`。
- 首次 Scrutiny Review 的“固定左四分之一裁切可用”结论因此失效；已按深思熟虑流程退回 Worker，而不是把不可靠运行结果写成通过。
- 最终代码、类型检查、6 files / 26 tests 聚焦回归及 133 files / 784 tests Server 全量回归均通过；本任务没有真实图片 Provider 调用。
