---
doc_id: AIR-G05-M3-SCRUTINY-001
status: passed
created: 2026-07-15
updated: 2026-07-15
owner: AI漫游项目
audience: reviewer, developer, qa, ai-agent
source: G5 契约、提交 ec71594、0013 overlay 与自动化证据
---

# G5-M3 Scrutiny Review

## 结论

`passed`。提交 `ec71594` 满足 G5-M3 Schema overlay、Working Copy 与编辑器外壳退出条件，可以进入 G5-M4。

## 静态复核

| 关注点 | 结论 | 证据 |
| --- | --- | --- |
| 数据库演进 | 通过 | 0013 只增加 V1 Working Copy、Layout 线性/current CAS、publication/export guard；不重复 G1 列/表，不提供 down migration |
| 发布清单 | 通过 | 启动要求精确成功的 13 段 ledger；G1 封印清单只登记明确的 0013 overlay，0001～0008 字节未改写 |
| Working Copy 协议 | 通过 | strict init/save/response/recovery codec；DB-only、800ms autosave、5 MiB batch 上限、no-op/replay/CAS conflict 明确 |
| 来源与素材 | 通过 | 初始化和保存重算 G4 current lock/source identity，并使用 DB ready Asset 的 sha/尺寸复核新增或变更的 source/crop/font |
| 历史边界 | 通过 | autosave 不创建 LayoutRevision、不更新 current formal pointer、不写 legacy `layout.json` 或 workspace project tree |
| 冲突恢复 | 通过 | 双标签冲突保留内存本地稿，可下载 recovery、加载服务端或显式保留本地重试；没有 last-write-wins |
| 页面边界 | 通过 | 桌面三栏外壳与属性/图层/基础命令接入 Shared reducer；窄于 1024px 只读且不初始化/保存 |
| 既有门禁 | 通过 | 新页面保留 G4 候选来源警告和生成/导出禁用；file/db E2E 分成独立子运行并有穷尽性回归测试 |

## 诊断结论

默认 E2E 曾把 DB-only 用例放进单一 file-mode 服务；新页面同时漏接 G4 来源提示。修复后每个 spec 精确归属 file 或 DB 模式，原始默认全量命令通过，G4 来源警告与 fail-closed 按钮恢复。没有遗留调试日志或临时 harness。

## 后续不变量

- M4 只能通过 Shared 命令修改 PanelFrame/FreeImage/template/crop/read order，不能绕过 M3 保存校验或直接改源 Asset。
- M5 才关闭受控 CJK 字体、富文本和气泡；M6 才创建不可变正式 Revision；M7 才开放正式导出。
- `test:render`、`test:migration:g5`、`test:e2e:g5` 的剩余结构化红灯必须由后续负责阶段真实关闭，不能在 M3 伪绿。
