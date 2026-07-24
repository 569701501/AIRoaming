---
doc_id: AIR-FINDINGS-20260724-MANGA-MINIMAL-DESIGN
status: complete
created: 2026-07-24
updated: 2026-07-24
owner: AI漫游项目
audience: human, ai-agent, developer, qa
source: 漫画成稿极简化设计任务
---

# 发现

## 事实

- `LayoutDocumentV2` 已经是自动成稿、手调、预览、Revision 和 Publication 的共同文档，不需要再建新模型。
- `layout_compose` 已支持 initial、full_reflow、scoped_reflow；Web 又把 scoped 展开为选中内容、当前页/段、当前场景，并额外暴露四种 intent。
- Pending 同时提供缩略对比和必须浏览到底的完整视觉对比，用户需要理解两种预览的权威性差异。
- 发布在 UI 中暴露“成稿预检 → 保存 Revision → 出版预检 → 提交出版任务”四步，但两次预检本质上都是同一份内容和来源正确性约束在不同目标上的重复呈现。
- 来源返修、版本历史、出版历史与编辑属性全部堆叠在一个工作台组件中。
- V2 preflight 已有 `DIALOGUE_BINDING_MISSING` 等 fail-closed 规则；问题是它出现得太晚，没有成为 Working Copy 可读状态的统一健康门。
- 现有 full/scoped reflow 只改布局、裁切、样式和尾巴，不能给 `dialogueBindings=[]` 的旧稿补正式 binding；内容门实施前必须新增受限、可撤销的 V2 reconciliation 语义命令。
- 普通 `user_edit` 只能证明字段被编辑，不能单独证明旧无来源气泡是用户自定义；自定义身份需由 user add 的 existence/text/source 保护组合或显式 confirm command 形成。
- `open/change/release` 若隐藏 rowVersion/digest，必须返回 opaque `draftToken` 供 autosave、Proposal、来源更新、恢复和发布原样回传，不能丢失 CAS。
- readiness 应先 shadow，再用独立开关分入口 fail-closed；Facade 总开关不能替代内容门自己的回滚边界。

## 删除测试

若移除某能力后仍能完成“正确成稿 → 人工调整 → 发布”，则不应留在普通主路径：

- 移除四种 intent：可由系统根据对象类型和质量问题自动推断，核心能力不丢失。
- 移除三种显式 scoped 选择器：当前 selection/canvas/shot 可由上下文推断，核心能力不丢失。
- 移除缩略预览：保留一份权威视觉 diff 即可，安全性更清楚。
- 移除用户手动执行两次 preflight：服务端仍在保存与出版边界执行，安全性不丢失。
- 移除摘要、rowVersion、M6/M7、Revision 等技术术语：状态仍可由系统管理，业务能力不丢失。
- 移除来源返修常驻卡片：仅在 stale 时展示单一修复动作，正常路径不丢失。

## 不可删除

- Storyboard 对白/旁白账本与 100% binding/disposition 覆盖。
- Working Copy、CAS/autosave、Undo/Redo、编辑保护。
- 来源密封与 freshness。
- Pending/Proposal 的服务端原子应用语义。
- 不可变 Revision、Publication 和确定性 RenderScene。
- 只读预览与正式产物的同一可见文档语义。
