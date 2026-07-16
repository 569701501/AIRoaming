---
doc_id: AIR-TASK-20260716-DUAL-STORYBOARD-PROMPT-REAL-AB-PROGRESS
status: completed
created: 2026-07-16
updated: 2026-07-16
owner: AI漫游项目
audience: human, ai-agent, developer, qa
source: task_plan.md
---

# 漫画 / 漫剧双轨分镜 Prompt V1/V2 真实 A/B 进度

## 2026-07-16：AB0 开始

- 已读取 `$deep-think`、浏览器技能、项目事实源、V2 方案、V2 本地运行复核和旧 S3 真实模型任务。
- 用户明确授权真实文本模型 A/B，并明确禁止调用付费图片服务。
- 当前角色为 Orchestrator，只冻结样例、版本、指标、隔离和可查看环境，不修改生产代码。
- 采用两个逻辑项目各创建一次、正式结构后复制数据库的方式，避免输入差异污染 A/B。

## 2026-07-16：AB1 正式基线完成

- 基线运行目录：`/Users/liyadong/.codex/runtime/airoaming-storyboard-ab-20260716-2247/base`；API `4334`，Web `5194`。
- SQLite 空文件需先创建再执行 Prisma migrate；17 个 migration 全部成功。系统全局 `pnpm` 为 7.12.1，与项目 9.15.4 不符，改用 `corepack pnpm` 后恢复，均属测试环境准备问题。
- AI 创作项目 `AB-AI-零点回声`（`dfb3aa62-6447-45bf-aee4-6aeea6476149`）已通过真实 `self/gpt-5.5` 完成大纲、第 1 章正式剧本和正式剧情结构：第 1 章 `无编号列车`，ScriptVersion `e76e0358-5b0f-4cbe-9f2a-b20f72d214d7`，StoryVersion `f00e48ce-e070-46d8-9ab7-7b20ac8f1515`，结构为 4 个角色、7 个场景、13 个节拍。
- 第一次自然语言粘贴原稿没有命中导入意图，误走 AI 大纲并被模型细拆为 12 章；已删除该错误项目。明确使用“请导入这份完整剧本并拆成章节”后，正确命中 `script-import-normalize`。
- 第一份自然格式两章原稿正确分析为 2 章，但第 1 章在忠实度验证被两个摘要性元数据误判为无来源新增而失败；第 2 章通过。为隔离分镜 Prompt 变量，保留失败证据后删除该项目，改用同故事、字段明确的标准完整两章剧本重新导入。
- 导入项目 `AB-导入-雨夜证词`（`76e071bd-7e97-4ed5-8de1-06ab590c9f51`）已通过真实导入路线形成两章 pending；只确认第 1 章并完成正式剧情结构。第 1 章 ScriptVersion `6086daf8-e51f-48a8-b109-8b0d446c8f81`，StoryVersion `34835ca7-ed9d-47ee-a087-53d09e5fb42c`，结构为 7 个角色、3 个场景、8 个节拍。
- 导入结构暴露两个非阻断上游问题：章节正文标题出现“第 1 章：第 1 章：最后一班渡轮”重复前缀；角色提取把“老周”和“远处的老周”拆成两个实体。本轮不修改生产代码，作为对分镜输出的已知输入噪声记录。
- 图片等持久任务 worker 全程关闭；结构确认虽然创建了角色图任务记录，但没有任何图片任务实际执行。

## 2026-07-16：AB2 数据分叉与双环境完成

- 正式基线 SQLite 与 workspace 复制到 V1/V2；复制前数据库 SHA256 一致。
- V1 使用 `c3fe684`，Prompt 文件 SHA256 为 `421c09a...4760`；V2 使用生产提交 `5551271` 的 Prompt，SHA256 为 `85efee4...d7ff`。当前运行提交 `6268b5f` 相对生产提交没有 Prompt 或测试内容差异。
- V1 API/Web 为 `4335/5195`，V2 API/Web 为 `4336/5196`；两套都关闭持久任务 worker。
- 两个逻辑项目的 ScriptVersion、StoryVersion 及 digest 在 V1/V2 两侧逐项相等。

## 2026-07-16：AB3 四次真实生成完成

- AI V1：24 shots，13/13 beats，首次通过，无修复。
- AI V2：17 shots，13/13 beats；首次命中 `STORYBOARD_DIALOGUE_MOTION_MISMATCH:shots[1]`，一次定向修复后通过。
- 导入 V1：14 shots，8/8 beats，首次通过；原稿六句对白全部逐字保留。
- 导入 V2：10 shots，8/8 beats，首次通过；原稿六句对白全部逐字保留。
- 四次结果均保存为待确认 Working Copy，没有替用户确认正式分镜。

## 2026-07-16：AB4 / AB5 复核完成

- 四组最终结果都通过引用、beat 覆盖、必填字段和 `promptDraft` 污染检查；项目角色 UUID 解析后未知引用为 0。
- V2 两条路线的漫剧时间过程均明显增强；AI 动态时间过程命中从 1/24 提高到 10/17，导入从 4/14 提高到 7/10。
- V2 镜头减少约 29%，漫画没有丢 beat，但 AI 样本少数 7～10 秒动态镜头负载偏高，且有一次修复。因此判定为 `MIXED / V2_DIRECTIONALLY_BETTER`，不回退 V1，也不宣称 V2 已全面验收。
- 四个页面均可打开并显示待确认草稿，浏览器 `error/warn` 日志为空。
- V1/V2 各 11 个角色参考图任务保持 `queued`，`running=0`、`succeeded=0`，没有调用付费图片服务。
- 完整量化和逐镜结论见 `evidence/metrics.json` 与 `evidence/ab-review.md`。
