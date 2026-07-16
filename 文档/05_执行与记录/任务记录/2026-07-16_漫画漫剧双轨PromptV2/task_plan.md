---
doc_id: AIR-TASK-20260716-DUAL-STORYBOARD-PROMPT-V2-PLAN
status: completed
created: 2026-07-16
updated: 2026-07-16
owner: AI漫游项目
audience: human, ai-agent, developer
source: 双轨分镜正式方案、ADR-0007、用户确认继续实施
---

# 漫画 / 漫剧双轨分镜 Prompt V2 任务计划

## 目标

在不改变页面、Schema、输出字段、公开 Skill 和确认流程的前提下，把生产分镜 Prompt 改为三层契约：共享剧情事实、漫画分镜规则、漫剧分镜规则；两条轨道同时生成、各自满足媒介要求且不互相矛盾。

## 非目标

- 不拆分 `Shot[]`，不新增独立 `comicShots[] / motionShots[]`。
- 不改现有 `comic / motion` 页面字段。
- 不新增 `motionPromptDraft`、动态视频任务、TTS、字幕或成片配置。
- 不把固定 15 秒、3 秒分段、9:16、黄金三秒或 provider 参数写成通用规则。
- 不调用收费图片或视频 provider。

## 验收标准

1. 生产 Prompt 明确包含共享事实、漫画分镜、漫剧分镜三块。
2. 删除“motion 只能补充 comic”“两者必须描述同一瞬间”的主从限制。
3. 漫画规则覆盖静态决定性瞬间、构图、阅读顺序、气泡空间和画格连续。
4. 漫剧规则覆盖开始/变化/结束状态、动作表演、运镜用途、内容时长、配音来源和尾首帧连续。
5. M1 仍输出现有完整 `Shot[]`，保留共同字段和固定枚举。
6. 定向修复 Prompt 使用“同一剧情锚点且不冲突”，不要求两轨文案或瞬间相同。
7. 固定测试锁住双轨边界、现有 generate/revise 行为和输出契约。
8. Server 相关测试、类型检查和构建通过。

## 阶段

| 阶段 | 角色 | 状态 | 退出标准 |
| --- | --- | --- | --- |
| D0 契约核对 | Orchestrator | completed | Prompt、修复、质量门、测试入口与兼容限制明确 |
| D1 Prompt V2 | Worker | completed | 三层 Prompt 落地，不改输出 Schema |
| D2 回归测试 | Worker | completed | 双轨语义与原有流程均有自动化保护 |
| D3 静态复核 | Scrutiny Review | completed | 代码、文档、契约和测试证据一致 |
| D4 运行复核 | Runtime/User Review | completed | 本地契约、类型和构建通过；真实模型 A/B 明确后置 |

## 回滚边界

改动仅限 Prompt 文案、必要的 Prompt 测试和文档。若测试或模型行为恶化，可单独回退本次提交，不涉及数据迁移。

## 退出标准

- D0～D4 状态完成。
- `progress.md`、`findings.md`、Handoff、双 Review 和完成记录齐全。
- 长期记忆已更新，工作树收口为独立提交。
