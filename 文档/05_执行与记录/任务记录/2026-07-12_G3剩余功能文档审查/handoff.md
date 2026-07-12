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
- 已提交基线：当前 HEAD（G3-M3-A10）；下一切片从 A11 开始，提交前不得把 dirty tree 当成已交付基线。
- G3-M0～M3-A10 已按切片交付；后续 Candidate/Lock、Task、verifier、backup、activate 仍未完成。
- 不得让 Luna 在不知情的 dirty tree 上继续堆叠。

## 必读五份

1. 文档/04_方案与决策/2026-07-12_G3-M施工包_依赖边界与切片门禁.md
2. 文档/04_方案与决策/2026-07-12_G3-M施工包_维护快照与运行态封口.md
3. 文档/04_方案与决策/2026-07-12_G3-M施工包_导入器决议与迁移账本.md
4. 文档/04_方案与决策/2026-07-12_G3-M施工包_备份恢复与DB-only激活.md
5. 文档/06_测试与验收/G3-M施工包_可执行验收与Luna交接.md

## 第一任务

下一张任务只领取 G3-M3-A11 Candidate/Lock 与 Task 历史导入；M0 已完成，不得重复建设 maintenance/reviewer/CAS 流程。

禁止同时实现 final import、verifier、backup、activate；禁止访问真实生产 workspace。

## 当前 blocker

- DB capability registry 尚未存在，当前多数 DB 写路径未实现。
- SecretStore、完整 importer、协调备份恢复均未实现。
- 真实切换需要用户再次明确授权。

因此可以开始 foundation 开发，但不能运行 production DB-only activate。
