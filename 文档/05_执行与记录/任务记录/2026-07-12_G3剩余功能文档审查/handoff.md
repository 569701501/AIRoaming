---
doc_id: AIR-HANDOFF-20260712-G3M-DOC
status: ready_with_gates
created: 2026-07-12
updated: 2026-07-12
owner: AI漫游项目
audience: human, ai-agent, developer
source: G3-M 五份施工资料静态审查
---

# Luna Handoff

## 交付结论

G3-M 文档已可用于逐切片开发，但不适合一次性要求“完成全部 G3”。第一张任务只发 G3-M0 maintenance gate。

## 当前仓库

- 分支：codex/g0-test-safety-net。
- 基线 HEAD：96c8845。
- G3-core 与本轮文档都仍在未提交工作树；交给 Luna 前必须先形成明确 commit，并把任务书 commit SHA 更新为新值。
- 不得让 Luna 在不知情的 dirty tree 上继续堆叠。

## 必读五份

1. 文档/04_方案与决策/2026-07-12_G3-M施工包_依赖边界与切片门禁.md
2. 文档/04_方案与决策/2026-07-12_G3-M施工包_维护快照与运行态封口.md
3. 文档/04_方案与决策/2026-07-12_G3-M施工包_导入器决议与迁移账本.md
4. 文档/04_方案与决策/2026-07-12_G3-M施工包_备份恢复与DB-only激活.md
5. 文档/06_测试与验收/G3-M施工包_可执行验收与Luna交接.md

## 第一任务

只实现 G3-M0：open/draining/closed/handed_off、runMutation、五类 participant、loopback+token 控制和 closed runtime bundle 骨架。

禁止同时实现 snapshot、importer、backup、activate；禁止访问真实 workspace。

## 当前 blocker

- DB capability registry 尚未存在，当前多数 DB 写路径未实现。
- SecretStore、完整 importer、协调备份恢复均未实现。
- 真实切换需要用户再次明确授权。

因此可以开始 foundation 开发，但不能运行 production DB-only activate。
