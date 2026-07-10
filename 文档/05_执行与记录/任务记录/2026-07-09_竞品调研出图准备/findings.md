# 开源平台出图准备调研发现

---
doc_id: AIR-TASK-20260709-PREFLIGHT-RESEARCH-FINDINGS
status: active
created: 2026-07-09
updated: 2026-07-09
owner: AI漫游项目
audience: human, ai-agent
source: 用户要求调研热门开源 AI 漫画平台并评估出图准备功能
---

## 需求理解

用户当前做到“候选工作台”，但对候选工作台之前的“出图准备”是否必要、是否做得好没有把握。需要调研热门开源 AI 漫画/图像生成平台，比较它们是否有类似能力，并沉淀适合 AI漫游保留的设计。

## 项目现状发现

- AI漫游当前主流程为：剧本 -> 剧情结构 -> 分镜工作台 -> 出图准备 -> 候选图工作台 -> 排版导出 -> 素材包。
- 出图准备当前不是第二个角色库，而是章节级“出门检查单”：只读取正式 `storyboard.json`，检查角色绑定、必要角色定稿、场景绑定、风格上下文，并写入 `preflight.json`。
- `preflight.json` 绑定 `sourceStoryboardId/sourceStoryboardUpdatedAt`，分镜变化会导致出图准备失效。
- 候选图生成任务必须通过后端 preflight guard，任务 input 会注入 `imagePreflightId/sourceStoryboardId` 和角色参考图资产 ID。
- 候选图工作台已具备真实图片落盘、锁定、完成本章、排版和素材包闭环，但候选生成体验仍可增强：prompt 不透明、单镜重画语义不够明确、批量生成和候选轮次不足。

## 外部调研发现

- GitHub 热门通用图像工作台中，AUTOMATIC1111 WebUI 约 164k stars、ComfyUI 约 120k stars、Fooocus 约 50.8k stars、InvokeAI 约 27.6k stars。它们生成、修图、workflow、prompt 参数能力强，但没有漫画章节级出图准备门禁。
- 漫画垂直开源项目较少且热度整体低：AI Comic Factory 约 1.3k stars 且已归档；StoryDiffusion 约 6.4k stars，核心是长序列角色一致性算法；PrintFilm 约 2.8k stars，采用 Script-to-Asset-to-Keyframe 分阶段工作流。
- 小型漫画生产项目 AI-Comic-Generator 和 MangaGen 虽然星标低，但明确提到 JSON 驱动、角色一致性、单格重画、批量生成、生成历史、项目级素材桶等能力，和 AI漫游后续方向高度相关。
- 漫画翻译类项目 manga-image-translator、comic-translate 不是原创出图平台，但其 Text Detection/OCR/Inpainting/Translation/Text Rendering 管线说明漫画工具天然需要阶段化生产，而不是一把梭。

## 初步判断

- AI漫游当前“出图准备”方向正确，应保留。
- 开源竞品普遍缺少“正式分镜版本 + 角色定稿 + 参考图注入 + 候选任务追溯”的业务门禁，这是 AI漫游的差异化优势。
- 后续不要把出图准备做重；它应保持检查和放行。真正要增强的是候选工作台：prompt 预览/编辑、单镜重画、批量生成、候选批次、废弃/保留状态和生成历史。

## 输出文档

- `文档/04_方案与决策/2026-07-09_开源AI漫画平台出图准备调研.md`
