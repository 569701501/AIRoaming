---
doc_id: AIR-TASK-G5-PLAN-001
status: complete
created: 2026-07-11
updated: 2026-07-11
owner: AI漫游项目
audience: human, ai-agent
source: ADR-0011、G1 Layout/Export Schema、G3 漫画版式、G4 候选定稿来源契约与现有排版实现
---

# G5 成稿编辑器规划

## 目标

在不扩张为无限白板或绘画软件的前提下，把现有“一镜一页预览 + 复制候选原图”的排版骨架升级为可形成真实漫画成品的桌面编辑器，并建立浏览器预览、服务端 PNG/PDF、不可变 LayoutRevision 与来源失效处理共用的确定性契约。

## 范围

- `LayoutDocument V1`、`PageProfile`、`LayoutPreset` 与漫画语义对象。
- 编辑命令、会话级撤销重做、Working Copy 自动保存与乐观并发。
- 画格、非破坏裁切、自由图片、横竖排富文本、四类气泡和受控字体。
- G4 stale/unresolved 来源在画布中的逐格与批量解决。
- LayoutRevision、LayoutSourceBinding、预检、只读预览与正式出版导出。
- 真正 PNG 合成；分页项目可选 PDF；竖向条漫确定性切片。
- 成稿步骤默认收起 AI 抽屉和 `PendingEditorCommandSet` 的确认边界。

## 非目标

- 不做任意多边形/贝塞尔画格、专业气泡节点、通用持久 Group、绘画、滤镜、inpaint、视频或多人协作。
- 不做手机完整编辑；手机只读预览与预检。
- 不做 G6 的素材 ZIP、下载包 manifest 或渠道资产包。
- 不重新设计七阶段框架，也不实现 D2 自动跨步骤调度。
- 本次只完善开发文档，不修改代码、Schema、数据库或真实 workspace。

## 阶段

| 阶段 | 内容 | 状态 | 退出标准 |
| --- | --- | --- | --- |
| G5-P0 | 读取事实源、审计现有实现并建立任务记录 | completed | 当前排版、数据、任务和依赖事实有证据 |
| G5-P1 | 核实候选画布/富文本/正式渲染技术路线 | completed | 技术选择门禁和候选路线可验证，不提前锁库 |
| G5-P2 | 收口 LayoutDocument、命令、保存、版本和来源契约 | completed | schema、状态机、digest、并发和错误码无歧义 |
| G5-P3 | 收口预检、渲染、导出、手机预览与 AI 权限 | completed | 浏览器预览和正式产物使用同一语义 |
| G5-P4 | 编写主方案、契约字典、渲染契约与验收清单 | completed | 可按垂直切片开发和独立验收 |
| G5-P5 | 同步上位文档、索引和记忆，完成静态复核 | completed | 无相互冲突、链接可达、状态为 accepted；实现未开始 |

## 强制验收标准

1. 编辑器库私有状态、DOM、视口缩放和设备像素比不得成为正式事实源。
2. 同一规范化 LayoutDocument 在桌面预览、手机只读预览和服务端正式输出中的对象几何、裁切、换行、竖排和气泡一致。
3. 中日文 IME、字符范围富文本、粘贴清洗、竖排标点、字体缺失和文字溢出均有自动化或黄金样例。
4. Working Copy 自动保存可恢复，正式 LayoutRevision 不可变；导出永远不读取未保存 Working Copy。
5. A 图入画布后改锁 B，旧 Layout/Export 不改写；新 Working Copy 必须显式解决 stale 后才能保存为当前正式修订并导出。
6. 正式导出通过持久 `layout_export` 任务运行，输出真实可解码 PNG；分页 PDF 和条漫切片绑定同一个 LayoutRevision 与 manifest。
7. 手机路由不调用任何编辑、Working Copy 写入、LayoutRevision 创建或导出确认接口。
8. AI 建议只能形成可预览、可放弃、来源绑定的待应用命令；用户应用前不能改画布或创建正式产物。
9. E0 原型失败时停止进入正式编辑页，先更换技术路线；不得以“先做交互、以后再修渲染”绕过门禁。

## 交付物

- `文档/04_方案与决策/2026-07-11_G5高自由成稿编辑器开发方案.md`
- `文档/04_方案与决策/2026-07-11_G5LayoutDocument与编辑命令契约字典.md`
- `文档/04_方案与决策/2026-07-11_G5确定性渲染与出版导出契约.md`
- `文档/06_测试与验收/G5成稿编辑器与确定性导出验收清单.md`
- 本目录的 `task_plan.md/progress.md/findings.md/handoff.md`
