---
doc_id: AIR-TASK-G5-HANDOFF-001
status: complete
created: 2026-07-11
updated: 2026-07-11
owner: AI漫游项目
audience: human, ai-agent, developer, qa
source: G5 规划交接
---

# G5 规划交接

## 已交付

- `文档/04_方案与决策/2026-07-11_G5高自由成稿编辑器开发方案.md`
- `文档/04_方案与决策/2026-07-11_G5LayoutDocument与编辑命令契约字典.md`
- `文档/04_方案与决策/2026-07-11_G5确定性渲染与出版导出契约.md`
- `文档/06_测试与验收/G5成稿编辑器与确定性导出验收清单.md`
- 本目录 task_plan/progress/findings/handoff。

## 当前状态

- 四份正式 G5 文档均为 `accepted`；ADR-0011 仍是已采纳上位产品边界，功能尚未实现。
- 规划任务已完成不等于功能完成。当前 LayoutExportWorkspace/LayoutExportService 仍是一镜一页/复制源图骨架。
- 本轮只写文档；未修改代码、Prisma Schema、migration、依赖、数据库或真实 workspace。

## 关键实施约束

1. 实际开发仍从 G0 开始，完成 G1–G4 后才能合并 G5 正式实现。
2. G5 第一项实际工作是 E0 可丢弃原型；原型通过后再新增技术 ADR，不能现在锁定 Konva/Fabric/Chromium/resvg。
3. LayoutDocument 是唯一业务文档；画布库/DOM/selection/viewport/Undo 不落盘。
4. Working Copy 只用于草稿，只有显式 LayoutRevision 可进入 task。
5. `layout_publication` 是一个 current 多 Artifact 版本；G6 ZIP 不得提前并入。
6. 旧复制源图导出必须在真实 publication green 后删除，不能作为正式 renderer 故障的回退后门。

## 复核结论

- Static/Scrutiny Review：通过。frontmatter、围栏、JSON 示例、内部路径、doc_id、格式与上位文档一致性均检查通过。
- Runtime/User Review：不适用。本轮无实现，无页面、API、数据库、PNG/PDF/切片可供运行验收；实施时必须按 G5 清单完成真实路径。

## 后续

- G6 素材包 V2 已按用户最新决定后置，不继续编写。
- 用户明确授权开发前，不执行 E0、不安装依赖、不修改 Schema；无需等待 G6/G7 文档。
