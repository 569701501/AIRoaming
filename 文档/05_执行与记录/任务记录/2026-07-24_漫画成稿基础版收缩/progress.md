---
doc_id: AIR-PROGRESS-20260724-MANGA-BASIC-CUT
status: complete
created: 2026-07-24
updated: 2026-07-24
owner: AI漫游项目
audience: human, ai-agent, developer, qa
source: 漫画成稿基础版收缩任务
---

# 进度

## 2026-07-24

- 用户已确认最小产品范围：首次无感自动排版、现有画布、自动保存、单一导出、人工文字差异弹窗。
- 已暂停并放弃此前继续扩张 Facade、内容修复 Proposal 和二次智能调整的方向。
- 已完成当前代码 zoom-out：工作台约 4083 行，同时承担五套职责；新 initial 路径已有正式对白原文覆盖硬门，但已有错误 Working Copy 打开与只读预览不会执行同等检查。
- P0 完成：V2 preflight 为用户修改/删除的正式文字补充说话者、类型、原文和当前文字证据。
- P0 完成：新增 `CUSTOM_TEXT_PRESENT`（用户自定义文字，确认后可继续）和 `UNOWNED_TEXT_PRESENT`（无正式绑定且无用户所有权证据，阻断）规则。
- P0 后续加固：`preflight.spec.ts` 扩展为 17/17；正式气泡隐藏、完全透明或整体移出画布均作为系统 blocker，未绑定文字按用户所有权区分确认或阻断。
- P1 完成：页面删除 Undo/Redo/立即保存、AI Drawer、full/scoped reflow、范围/intent、双预览、建议应用/放弃、四步出版、版本历史与批量智能入口。
- P1 完成：Editor Session 删除 snapshot history 与 Pending AI 状态；富文本编辑器删除 history group；首次 composition session 只保留 `startInitial()`。
- P1 运行修复：正式气泡“删除”统一映射为可恢复隐藏；属性面板显隐按钮由固定隐藏改为真实切换，改字后的正式气泡可隐藏再恢复且保留文字。
- P2 完成：顶栏只保留自动保存状态、手机预览与一个“导出”按钮。导出内部依次执行 autosave、Working Copy preflight、Revision、Revision publication preflight、Publication 和 Artifact 展示。
- P2 完成：Revision 网络/5xx 歧义保留完整原请求并精确重放；Publication POST 歧义保留 requestId 自动确认，同一导出本地快照不依赖历史列表成功。
- P2 加固：所有 Publication history/get-by-id/POST 响应都通过单调状态合并，旧 queued/rendering 响应不能覆盖 ready/failed/cancelled。
- P3 完成：Shared 37 files / 257 tests；Web 55/55；Server Layout 4 files / 11 tests；Shared、Web、Server typecheck 全通过；`git diff --check` 通过。
- P4 完成：删除目标测试章节唯一旧 Working Copy 后，页面无感生成 V2 Working Copy `layout_wc_4d49df6c-6eae-45b2-8c5c-782b46b91ed3`，共 9 段、11 镜头、19 条正式绑定。
- P4 完成：真实操作改动第一条值班员对白，自动保存后导出弹窗精确显示镜头、说话者、原文与当前文字；隐藏/显示后修改文字仍保留。
- P4 完成：先后形成 `export_dd01cc06-5dfd-448d-a034-3b25d384a1e6` 与 `export_712a7227-8253-4dc6-b1b4-9d32ab0734fb`，均 ready，并生成条漫长图、manifest 与 3 张切片。
- P4 完成：只读预览逐段核对 9 段、11 张图片和 19 条正式文字全部存在；首段、中后段和结尾均保留截图。
- P5 完成：三个独立子级分别完成删减边界审计、显隐错误诊断和单一导出恢复复核；发现项均修复并补回归。
- 数据安全：修改前一致性备份为 `/private/tmp/airoaming-before-layout-reset-20260724.sqlite`，`integrity_check=ok`，SHA-256=`ed8f201102955a8c7744ef9e0652db06ef06552b259ce9265c17e1d6f7d5ba74`。
