---
doc_id: AIR-D2-A2-2-FINDINGS-001
status: active
created: 2026-07-13
updated: 2026-07-13
owner: AI漫游项目
audience: human, ai-agent, qa
source: A2-2 execution
---

# Findings

## 已确认

- G2 Working Copy clear、pending adopt/discard 已存在并有 fresh SQLite 证据；A2-2 只需要把旧入口退役，不复制第二套写模型。
- DB 模式 reset/import/legacy source-pending 路由必须在业务读写前返回 409，不能调用 workspace clear 或 LocalProject whole-tree write。
- 7 个 legacy operation 已由 `retired + reason + replacement + evidence` 关闭；`project_chapter_script` aggregate 已升级为 implemented，`blockedIds` 从 6 降为 5。
- 只读 impact preview 能在执行逐章替代动作前展示章节工作稿、正式历史、pending 与下游计数；它不写 DB、不扫描或修改 workspace。

## 风险

- retired 只在 reason、replacement、rejection 和 replacement success 证据齐全时关闭 blocker；不能把普通 unsupported 当绿色。
- A2-2 不实现物理清空或整文件导入；这是有意的安全边界，避免删除 formal history、回退 milestone 或覆盖当前事实。
