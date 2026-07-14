---
doc_id: AIR-G05-M3-RUNTIME-001
status: passed
created: 2026-07-15
updated: 2026-07-15
owner: AI漫游项目
audience: runtime-reviewer, developer, qa, ai-agent
source: 提交 ec71594 的 fresh SQLite、真实浏览器与全量回归结果
---

# G5-M3 Runtime/User Review

## 结论

`passed`。DB-only Working Copy、真实页面交互、冲突/恢复边界、窄屏只读和既有来源门禁均已运行；M3 可以关闭并连续进入 M4。

## 数据库与 API

- fresh SQLite 应用 13 段 migration 后，默认布局和空白布局都能初始化；空白初始化不创建正式 Revision，也不生成 workspace project tree。
- 保存覆盖 changed/no-op/replay、expected rowVersion 冲突、双标签冲突、重启后读取和 stale recovery。
- P6/G4-D 长链在旧导出完成后切换为 V1 Working Copy，来源更换、历史隔离和 restart 继续通过。
- Server 全量：84 files / 544 tests，通过；Shared 全量：86/86，通过。

## 真实浏览器路径

- 桌面宽度实际打开完整编辑器：顶部保存状态、工具栏、页面导航、画布、属性和图层均可见；三张初始画格正常呈现。
- 选择对象并执行“锁定”后，800ms autosave 将数据库 rowVersion 从 1 推进到 2；Undo 再保存推进到 3，Redo 状态同步。
- 800px 窄屏显示“手机端只读”，不显示可编辑画布；等待后数据库仍为 rowVersion 3，没有初始化或保存写入。
- 页面 console warning/error 为 0。浏览器技能促使本轮同时检查真实桌面交互和窄屏网络副作用，而不只依赖静态组件断言。
- G4 候选更换/清空路径复跑后，来源警告、返回候选入口和生成/导出禁用均保持 fail-closed。

## 工程门禁

- E2E 环境与矩阵：33/33；默认 `test:e2e` 分别运行 file 4/4、DB 3/3，全部通过。
- 全仓 typecheck、E2E typecheck、build、Prisma validate、G1 manifest/migration check、fixture 3/3 与 diff check 通过。
- Web build 仅保留既有的大 chunk 提示，不影响退出码；未发现新运行错误。

## 后续红灯

`test:render` 仍由 M5/M7 负责字体和正式 renderer；`test:migration:g5` 仍由 M8 负责 legacy layout；G5 完整 vertical slices 仍需 M4～M8。它们是可解释的阶段红灯，不是 M3 通过项。

## 副作用边界

所有运行使用受标记临时根、fresh SQLite、loopback fake provider 或只读浏览器检查。未删除 backup/archive，未执行 down migration，未回退 file-only，未进入 G6/视频，未 push。
