---
doc_id: AIR-TASK-20260724-MANGA-HUMAN-UX-HANDOFF
status: ready
created: 2026-07-24
updated: 2026-07-24
owner: AI漫游项目
audience: developer, qa, ai-agent
source: Runtime/User Review 与 Scrutiny Review
---

# Handoff

## 当前状态

- 任务完成，结论为 `FAIL / changes_requested`。
- 产品代码未修改。
- 标准本地 DB 已应用 migration `0019_layout_revision_v2_publication`。
- 当前测试章节 Working Copy 已通过页面恢复为 Revision 1，row version 为 `v102`。
- 正式 Revision 1、Publication 1 和产物未修改。

## 下一实施任务

先修文字/气泡状态同步与完整 Undo，再处理窄屏入口和智能预览门禁。建议最小垂直切片：

1. 复现并锁定 selection ID、富文本 editor key 和 command dispatch 的不同步点。
2. 让文字、runs、bubble kind、direction、semantic/SFX preset 进入统一 command history。
3. 增加空渲染和 editor/document mismatch 预检。
4. 用本任务同一项目和同一浏览器路径做回归。

## 强制回归

```text
选中气泡
→ thought 改 shout
→ 改字
→ 横排改竖排
→ Undo 三次逐步恢复
→ Redo 三次逐步重放
→ 新增文字
→ 输入“轰——”
→ 应用 SFX
→ 切换到另一对象再切回
→ 保存、刷新、手机预览
→ 预检
```

验收要求：

- 每一步画布、属性面板、LayoutDocument 和历史栈指向同一对象。
- 不出现空气泡或空文字对象。
- 刷新后内容、样式和选择无关状态一致。
- `1180px` 仍能找到手机预览与版本出版。

## 证据入口

- [Runtime/User Review](runtime_user_review.md)
- [Scrutiny Review](scrutiny_review.md)
- [证据索引](evidence/README.md)
