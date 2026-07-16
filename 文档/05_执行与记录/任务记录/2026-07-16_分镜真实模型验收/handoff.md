---
doc_id: AIR-TASK-20260716-STORYBOARD-S3-HANDOFF
status: completed
created: 2026-07-16
updated: 2026-07-16
owner: AI漫游项目
audience: human, ai-agent, developer, qa
source: S3 真实模型验收、隔离数据库、浏览器与回归测试
---

# 分镜真实模型验收 Handoff

## 已完成

- AI 创作项目 `4c5e8a2b-759f-49cd-88cf-1086498b3137`：12-beat StoryVersion 生成 24 镜并确认，正式链为 `0996d782... → ee2bdc0f... → 76a1d0fd...`。
- 已有剧本项目 `9436e993-b2cd-4219-a57f-b1307207aba9`：目录一次确认后创建两章待确认草稿，只确认第 1 章；7-beat StoryVersion 首次命中空对白画格质量门，一次修复后生成 12 镜并确认，正式链为 `1e1bb4a9... → c889b0f4... → 6c229ede...`。
- 两路共用 `storyboard-shot-generate`、同一解析/质量/引用映射路径；确认前无正式分镜且下游禁用，确认后章节 `storyboard_done` 且出图准备解锁。
- 修复 AI 章节 pending 把项目级对话线程错误绑定到章节审计字段的问题；正式来源绑定仍完整，数据库 G1 作用域门未放宽。
- OpenCode 文本生成会话改为新会话和每次消息双重 deny-all，历史复用会话也会被收紧；越权创建的临时文档已删除。

## 验证证据

- Runtime/User Review：`passed_real_model`。
- Scrutiny Review：`passed`。
- 聚焦回归：3 files / 7 tests 通过；Server typecheck 通过。
- Server 全量：114 files / 681 tests；679 通过，2 个既有固定 5 秒重型用例并发超时，隔离重跑各 1/1 通过。
- 两项目浏览器控制台 error/warn 为 0，隔离 SQLite `integrity_check=ok`。
- 浏览器页和隔离 Server/Web 已关闭，`4332/5192` 无监听。

## 明确未做

- 没有调用真实图片 provider，没有生成候选图，也没有评测角色一致性、场景一致性或图片审美。
- 没有修改页面字段、Storyboard Schema、数据库结构、确认节点或公开 Skill 数量。
- 两个样例不代表所有题材、长稿和商业质量的穷尽覆盖。

## 下一步

只有用户明确授权真实图片 provider、模型和费用范围后，才进入 S4 固定镜头集真实图片评测。S4 应按 provider 分开记录，不复用一个混合总分。
