---
doc_id: AIR-SCRUTINY-20260724-MANGA-MINIMAL-DESIGN
status: passed
created: 2026-07-24
updated: 2026-07-24
owner: AI漫游项目
audience: human, ai-agent, developer, qa
source: ADR-0021 独立静态复核
---

# 漫画成稿极简化设计静态复核

## 复核范围

- `ADR-0021_漫画成稿内容就绪门与极简门面.md`
- 任务计划、发现和 Handoff
- 现有 `LayoutDocumentV2`、Working Copy、Pending、Application、Revision、Publication 不变量
- 指定真实测试章“技术可展示但内容错误”的证据

## 首轮结论

`failed`，S0=0，S1=4。

| 编号 | 阻断问题 | 修正 |
| --- | --- | --- |
| S1-1 | 只定义内容门，没有可执行的 binding 修复路径；旧 `dialogueBindings=[]` 会被阻断后无法恢复 | 增加受限 `content.reconcile_from_storyboard` 命令；由 Server 依据冻结 Storyboard 和完整规范化 dialogue ledger 构建 Proposal，Shared 重算摘要并校验，应用可一次 Undo |
| S1-2 | Facade 隐藏 rowVersion/digest 后没有说明 autosave 与 CAS 如何保留 | `open` 返回 opaque `draftToken`，所有保存、建议应用、来源更新、恢复与发布都由 `change/release` 原样回传并在 Server 内展开复核 |
| S1-3 | `user_edit` 不能区分“旧错误对象被改字”和“用户明确创建的自定义内容” | 固定 user add 的 protection 组合，并新增 `text.confirm_custom` / `balloon.confirm_custom`；普通改字不能补自定义身份 |
| S1-4 | 若先对旧稿 fail-closed，再实现修复，会造成不可用窗口 | readiness 独立开关按 `off → shadow → on` 推进；先实现修复命令，再按 initial、Proposal、save/open、preview 分入口启用 |

## 第二轮结论

`passed`，S0=0，S1=0。

复核确认：

- 一个 `LayoutDocumentV2`、Pending/Application 分离、两次服务端预检、不可变 Revision/Publication 均被保留；
- 用户路径已收敛为一个工作台、一个内容门、一个建议模型和一条发布链；
- `open/change/release` 没有牺牲 autosave、CAS、冲突恢复和 exactly-once；
- 错误 Working Copy 有可预览、可放弃、可应用、可撤销的修复路径；
- 普通 UI 的删除项不承担不可替代的正确性或恢复职责；
- 首轮不改数据库，feature gate 可按入口回滚。

第二轮提出的两个 S2 改进也已闭合：

1. `proposalIntegrity` 改为逐 dialogue item 比较：原本合法项不得退化或换桶，本次声明修复项必须合法，未声明项不得变成另一种未解释错误。
2. 修复命令 payload 密封完整规范化 dialogue ledger snapshot 与 digest，Shared 可独立重算并核对文字、类型、说话者和 item identity。

## 最终判定

该方案满足设计阶段退出标准，可进入 P0“内容就绪前置”实施。

Runtime/User Review 本轮不适用，因为没有修改运行时代码或页面；不得把旧页面结果冒充新方案验收。
