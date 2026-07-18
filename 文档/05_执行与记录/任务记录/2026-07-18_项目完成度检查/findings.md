---
doc_id: AIR-TASK-20260718-COMPLETION-AUDIT-FINDINGS
status: active
created: 2026-07-18
updated: 2026-07-18
owner: AI漫游项目
audience: human, ai-agent
source: 项目文档、代码、测试与运行证据
---

# Findings

## 1. 总结论

- 当前已确认开发波次 `G0～G5` 仍为 `G0_G5_COMPLETE`：项目创建、双来源剧本、剧情结构、双轨分镜、出图准备、候选生成与修订式定稿、成稿编辑和 PNG/PDF/条漫出版均有代码、数据库和自动化证据。
- 长期七阶段漫画 MVP 尚未完成：第七步当前只能生成本地目录与 `manifest.json`，没有正式 ZIP、下载入口和 G6 持久导出任务闭环。
- 轻漫剧只有 Storyboard `motion` 内容字段与 Prompt 基线；TTS、字幕/BGM、视频时间轴和 MP4 导出没有生产 worker 与用户链路。
- 图片 Prompt 专业 V2 已离线通过，但真实 V1/V2 视觉质量未执行；不得把离线合同通过写成真实成图质量通过。

## 2. 完成度口径

| 范围 | 当前估算 | 说明 |
| --- | ---: | --- |
| 当前约定的 G0～G5 波次 | 100% | 技术实现、自动化、历史运行复核和用户签收均完成 |
| 完整七阶段漫画 MVP（含正式素材包） | 80%～85% | 主要缺 G6 ZIP/下载/正式 PackageRevision 任务闭环，以及发布与启动收口 |
| 完整产品愿景（再含轻漫剧） | 60%～65% | 视频侧只有上游镜头字段，生产链基本未实现 |

以上百分比是按交付成熟度和剩余工作量估算，不按页面数量平均分配。

## 3. 分阶段判定

| 阶段 | 判定 | 证据与边界 |
| --- | --- | --- |
| 项目库/创建/设置/工作台 | 已完成 | 项目版式、七步导航、DB-only 项目与章节、设置和 SecretStore 已接通 |
| AI 创作 A 流程 | 已完成 | 大纲确认、显式逐章生成、采用/丢弃、完成本章和跨章连续性均有真实模型与浏览器证据 |
| 已有剧本 B 流程 | 已完成 | 不可变原稿、目录一次确认、后台生成全部待确认稿、失败章重试和逐章确认均有真实模型证据 |
| 剧情结构 | 已完成 | 固定质量门、一次修复、真实模型生成/确认与版本来源绑定通过 |
| 漫画/漫剧双轨分镜 | 已完成上游 | 漫画与 motion 字段、固定门和真实模型通过；不等于轻漫剧视频已经完成 |
| 出图准备/角色场景参考 | 已完成技术链 | 版本门禁、持久任务与来源追溯通过；图片质量仍受 Provider 能力影响 |
| 候选图与定稿返修 | 已完成技术链 | Candidate、Asset、任务、收藏/废弃、定稿历史、影响预览和 stale 门禁通过 |
| 图片 Prompt V2 | 离线完成 | 生产代码和固定测试通过；付费视觉 A/B 因预算为 `not_run` |
| 排版出版 | 已完成 | LayoutDocument、Working Copy、富文本/气泡、来源返修、PNG/PDF/条漫与确定性渲染通过 |
| 素材包 | 部分完成 | 页面、本地目录和 manifest 可用；没有 ZIP、下载和正式 G6 异步闭环 |
| 轻漫剧视频 | 未完成 | `tts_generate/video_export` 仅保留 Schema/任务策略占位，没有真实 worker/UI/MP4 |

## 4. 本次新鲜验证

- Workspace 与 E2E typecheck：通过。
- Shared：26 files / 153 tests 通过。
- Server 单 worker：120 files / 722 tests 通过。
- Production build：Shared、Server、Web 通过。
- Prisma Schema：valid。
- Playwright 环境准备：34 + 3 项通过。
- Playwright：file 4/4、DB-only 13/13 通过；只使用 loopback fake provider，付费调用为 0。
- G5 render gate：green；migration gate：green。
- `git diff --check`：通过。

非阻断噪声：正式出版 E2E 仍出现一次 `ERR_STREAM_PREMATURE_CLOSE`；断言、产物和后续测试通过。Web 主工作区构建 chunk 为 994.28 kB，存在拆包性能债。

## 5. 交付与运行风险

1. 当前分支比远端上游领先 35 个提交，且图片 Prompt V2 还有一批未提交文件；功能存在于本机不等于已经安全交付到远端。
2. 根目录标准 `pnpm dev` 未显式设置 `AIROAMING_PERSISTENCE_MODE=db`，当前代码默认 file mode；正式 DB-only 能力虽已实现并真实切换验收，但一键启动/发布配置尚未收口，普通启动可能进入兼容路径。
3. 没有全局“零预算/禁止图片生成”门禁。候选图、角色参考图、场景参考图和结构确认后的角色预览排队仍可能调用图片 Provider。
4. `文档/00_索引/全流程与字段清单.md` 和 `核心数据模型.md` 仍保留 G4/G5 未完成、数据库未接通等旧结论，已经与代码和最新完成记录漂移。
5. 图片 Prompt V2 没有真实视觉证据；Grok 单参考/三图上限、OpenAI 端点稳定性等 Provider 边界仍存在。
6. 对话框“停止生成”、手动章节管理、面向普通用户的一键安装/升级/恢复体验仍未形成完整产品化能力；这些不阻塞当前内部 G0～G5 技术闭环，但阻塞更广泛交付。

## 6. Scrutiny Review

- 对 `G0～G5` 当前波次：`passed`。
- 对完整七阶段漫画 MVP：`not_complete`，阻断项为 G6 正式素材包与交付收口。
- 对完整产品愿景：`not_complete`，额外阻断项为轻漫剧生产链。

## 7. Runtime/User Review

- 本轮隔离 fake-provider 浏览器矩阵：`passed`。
- 既有真实文本模型的 A/B 剧本、结构和分镜路径：`passed_real_model`。
- 图片 Prompt V2 真实视觉：`not_run_by_budget`。
- 当前用户实际启动配置与真实项目全链：本轮未操作，不能用隔离 E2E 代替。
