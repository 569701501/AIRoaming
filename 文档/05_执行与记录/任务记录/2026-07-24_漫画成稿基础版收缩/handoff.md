---
doc_id: AIR-HANDOFF-20260724-MANGA-BASIC-CUT
status: complete
created: 2026-07-24
updated: 2026-07-24
owner: AI漫游项目
audience: human, ai-agent, developer, qa
source: 漫画成稿基础版收缩实施结果
---

# Handoff

## 交付结论

漫画成稿普通用户路径已收缩为：

```text
首次无稿自动排版一次
→ 人工画布逐项调整
→ 自动保存
→ 一个导出入口
```

二次智能调整、范围/intent、建议对比、撤销重做、立即保存、版本历史和四步出版 UI 已退出。底层 Working Copy CAS、双 preflight、不可变 Revision、Publication、renderer、manifest 与 Artifact 均保留。

## 核心实现

- `packages/shared/src/layout/preflight.ts`：区分系统文字错误与用户主动变化，并返回镜头、说话者、原文和当前文字。
- `packages/shared/src/layout/commands-v2.ts`：正式气泡显隐可恢复，防止隐藏/resize 给旧无来源文字伪造所有权。
- `apps/web/src/composables/layout-editor-session.ts`：删除本地 Undo/Redo/Pending AI，保留自动保存和精确 Revision 重试。
- `apps/web/src/composables/layout-composition-session.ts`：只保留首次 initial。
- `apps/web/src/components/workbench/LayoutExportWorkspace.vue`：基础编辑器、自动保存、手机预览、单一导出与文字差异弹窗。
- `apps/web/src/components/workbench/layout-publication-state.ts`：Publication 进度单调合并，防止异步旧响应覆盖终态。

## 验证

```text
packages/shared test          37 files / 257 tests passed
apps/web test                 55 / 55 passed
apps/server layout tests      4 files / 11 tests passed
shared/web/server typecheck   passed
git diff --check              passed
```

真实浏览器完成首次无感排版、改字、自动保存、隐藏/恢复、差异确认、两次正式导出、重载恢复和只读预览。证据位于本目录 `evidence/`。

## 数据状态

- 测试项目：`d14f801d-5d35-4cb1-8021-600d39ec477b`
- 测试章节：`d14f801d-5d35-4cb1-8021-600d39ec477b_chapter_001`
- 当前 Working Copy：`layout_wc_4d49df6c-6eae-45b2-8c5c-782b46b91ed3`
- 当前初稿：9 段、11 镜头、19 条正式绑定
- 已完成 Publication：`export_dd01cc06-5dfd-448d-a034-3b25d384a1e6`、`export_712a7227-8253-4dc6-b1b4-9d32ab0734fb`
- 修改前备份：`/private/tmp/airoaming-before-layout-reset-20260724.sqlite`

## 后续边界

- 具体属性区和编辑手势仍可继续做易用性收缩，但必须单独以真实逐项任务评估。
- 不恢复二次 AI 排版、撤销重做或多步出版 UI。
- 不把规则 fallback 粗稿宣传为无需人工检查的专业终稿。
- 滤镜、网点、新气泡轮廓和复杂文字特效仍不在当前范围。
