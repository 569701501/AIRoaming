---
doc_id: AIR-G05-M7-SCRUTINY-001
status: passed
created: 2026-07-15
updated: 2026-07-15
owner: AI漫游项目
audience: reviewer, developer, qa, ai-agent
source: G5 契约、提交 d8ed6cc、0015 migration 与 M7 自动化
---

# G5-M7 Scrutiny Review

## 结论

`passed`。提交 `d8ed6cc` 关闭固定 Chromium renderer、持久 `layout_export` 任务、staged Asset/Outbox 恢复、页漫 PNG/PDF、条漫切片/条件长图与 canonical publication manifest，可以连续进入 G5-M8。手机、AI pending、legacy runtime cutover 与总体五条用户路径仍由 M8 关闭，未提前签收。

## 静态复核

| 关注点 | 结论 | 证据 |
| --- | --- | --- |
| 输入冻结 | 通过 | 创建事务只接受 Chapter current 的 sealed immutable LayoutRevision；preflight/profile/document/source digest 与 Asset manifest 一起写入 task input/source rows |
| renderer 隔离 | 通过 | 独立 RenderScene；用户文字仅写 `textContent`；CSP 默认拒绝，只有 `https://airoaming.invalid/assets/{assetId}` 可由内存 manifest 满足，无 file scheme/外网 fallback |
| 输出确定性 | 通过 | 固定 Chromium/scene/policy/build digest；PNG 三次与 PDF 三次 sha 各自相同；PDF 时间与 document ID 等长规范化 |
| 字体 | 通过 | renderer 只读取任务固定 FontAsset bytes；真实 PDF 含 NotoSansSC 子集、CharProcs 与 ToUnicode，不暴露本地路径/文件名 |
| 条漫切片 | 通过 | Shared 先算稳定切点，优先 section boundary；20×1920 corpus 生成 5 个 1080×7680 PNG，区间连续且不超过限制 |
| task fencing | 通过 | `layout-render` 并发槽=1、maxAttempts=2；queued/retrying 原子 claim 为 rendering，heartbeat/claimToken 贯穿 phase 与终态事务 |
| staged/recovery | 通过 | 稳定 Artifact ID；DB 先建 staged Asset/Artifact/Outbox，提升只处理本 publication 的精确 asset；重试发现完整 staged set 后不重渲染、不重复建行 |
| 终态原子性 | 通过 | 全部 Artifact ready、manifest 校验后，Export ready、current pointer 与 Task/Attempt succeeded 在同一 fenced 事务完成 |
| 迟到结果 | 通过 | 完成时重新计算 source/current applicability；新 Revision 后旧任务只记 historical，不移动 Chapter currentExportRevisionId |
| DB 约束 | 通过 | 0015 forward-only triggers 固定现代 publication/task/artifact/ready/attempt 映射；不改表、不执行 down migration |
| 页面入口 | 通过 | Web 使用 M6 preflightDigest/issueKey acknowledgement 创建任务，轮询活动 publication，展示 current/historical、取消与 scoped Artifact 链接 |

## 复核中关闭的问题

- 初版 publication worker 复用全局 Outbox `processNext`，可能顺带消费无关删除/archive 事件；现改为按 `assetId` 精确 claim/promotion。
- E2E 隔离 HOME 使服务端 Chromium 默认路径失效；现 Playwright 配置先校验账号缓存中的固定 executable，再只向 E2E Server 注入该已校验路径，继承环境中的伪造 override 不会穿透。
- tsx 源码直跑会给序列化到页面的闭包注入 `__name`；隔离 RenderScene 显式安装无副作用命名兼容层，生产构建和 E2E 均使用同一 renderer 代码。
- 第 15 个迁移加入后，G1 formal tree allowlist、release identity 和旧“14 migrations”断言发生漂移；已统一为 0015，并重生成可验证的 G1 manifest。

## M8 保留项

- 手机专用只读预览 route 与网络层 0 写断言。
- PendingEditorCommandSet 的 preview/apply/discard/expire 与一次 Undo。
- legacy layout 可解析转换、unresolved 重建、runtime 旧写/旧复制导出入口删除。
- 总体页漫/条漫/返修/故障/手机+AI 五条路径、性能/可访问性/安全矩阵与最终用户签收。
