---
doc_id: AIR-G05-M4-SCRUTINY-001
status: passed
created: 2026-07-15
updated: 2026-07-15
owner: AI漫游项目
audience: reviewer, developer, qa, ai-agent
source: G5 契约、提交 93a58b2、M4 自动化与运行证据
---

# G5-M4 Scrutiny Review

## 结论

`passed`。提交 `93a58b2` 满足画格、图片、模板、裁切、阅读顺序和页面/条漫分段退出条件，可以连续进入 G5-M5。

## 静态复核

| 关注点 | 结论 | 证据 |
| --- | --- | --- |
| 来源权威 | 通过 | Server 只从 Shot 的 current CandidateLockRevision 生成只读 source catalog；返回完整 Shot/Candidate/LockRevision/Asset/sourceDigest，不读取旧 lock ID |
| 画格复合关系 | 通过 | PanelFrame 的 contentImage 保持嵌套，不独立占顶层图层；detach/attach 使用原子 batch，可一次 Undo |
| 非破坏裁切 | 通过 | zoom/offset/rotation/flip 只写 crop；Shared 与 Server 共用 cover 几何，空洞在保存前拒绝；源 Asset bytes/sha 不变 |
| 模板安全 | 通过 | 七类 preset 生成正式 PanelFrame；画格数少于 occupied 时阻止；Text/Balloon/FreeImage 不删除、不重排 |
| 批量初始化 | 通过 | Shared 单一规则按页漫每 4 镜头分页、条漫每 1 镜头分段；来源顺序、reading order 和实体 ID 明确，可通过正式 canvas command 重排 |
| Shot tray | 通过 | 可见放置只统计画布内、非 hidden、opacity>0 的 panel content/free image；隐藏子图和完全画布外元素不计数 |
| DB-only 保存 | 通过 | 页面所有修改进入 M3 command/history/autosave；Server 保存继续重算 current source、ready Asset sha/尺寸和 crop coverage |
| 阶段边界 | 通过 | M4 没有创建正式 Revision、renderer、publication、legacy migration 或 CJK FontAsset；相关结构化红灯保持真实非零 |

## 复核中关闭的问题

- 普通开发服务运行在 file mode 时编辑器按预期返回 `LAYOUT_DB_ONLY_REQUIRED`；正式运行证据改用项目隔离 DB-only harness，不把 fail-closed 误判为实现阻塞。
- current Working Copy 尚无正式 export 时，页面曾误报来源异常；现只使用 `buildLayoutWorkingCopy` 门禁判断，真正 stale/incomplete 仍提示。
- detach 后自由图覆盖空画格，鼠标不易重新选中目标；新增“放入空画格”明确动作，复合命令仍保持可撤销。
- E2E 矩阵新增 M4 spec 后，登记合同遗漏期望项；已补齐并复跑 33/33。

## 后续不变量

- M5 文字与气泡必须继续使用同一 LayoutDocument/command/autosave，不得另存 DOM/Konva 私有状态。
- M5 必须用受控 FontAsset bytes、sha、cmap、license/embedding；不能退回系统字体。
- M6 才允许显式创建不可变 LayoutRevision 和 stale replacement commit；M7 才允许正式渲染与出版。
