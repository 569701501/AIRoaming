---
doc_id: AIR-TASK-20260716-SCRIPT-IMPORT-PRODUCTION-RUNTIME
status: passed
created: 2026-07-16
updated: 2026-07-16
owner: AI漫游项目
audience: human, ai-agent, developer, qa
source: DB-only Playwright、Vitest、E2E runtime
---

# Runtime / User Review

## 结论

`passed_db_only`。已有剧本 B1～B5 的真实用户路径已在隔离 DB-only Chromium 中通过；AI 创作显式单章路径也已单独回归通过。

## 已验证用户路径

1. 在剧本对话框上传完整文本文件。
2. 页面显示观察性大纲、拆章候选、边界证据、警告和确认入口。
3. 用户确认拆章目录一次。
4. 系统创建全部章节入口并展示整批逐章结果。
5. 打开导入章节，正文区全文只读。
6. 页面不显示采用、丢弃；保存、完成和重置不可用。
7. 点击“确认章节”，当前章形成正式版本并显示“进入本章剧情结构”。
8. 切换到另一章仍可查看其独立待确认稿；无需按顺序确认。

## 运行证据

| 范围 | 结果 | 运行标识 |
| --- | --- | --- |
| 已有剧本 B1～B5 Chromium | 1/1 passed | `g0-31741-mrmv1uvu-b5d7a415` |
| AI 显式单章 Chromium 回归 | 1/1 passed | `g0-32519-mrmv23vz-0f1c1c09` |
| E2E 环境契约 | 34/34 passed | prepare 内复核 |
| E2E prepare | 3/3 passed | shared/dist 不变、source alias 正常 |
| Server 全量 | 590/590 passed | 100 files，single fork |
| Shared 全量 | 152/152 passed | 26 files |

## 未宣称的范围

- 本轮未重跑完整 9 项 DB Playwright 矩阵，只运行与本功能直接相关的 A/B 两条路径。
- 未使用真实外部模型或用户真实项目；浏览器使用隔离 workspace、fresh SQLite 和受控本地 provider。
- 未验证超长稿分层和后台恢复，因为当前版本尚未提供这两项增强能力。
