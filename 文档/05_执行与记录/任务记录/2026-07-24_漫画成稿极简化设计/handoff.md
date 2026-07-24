---
doc_id: AIR-HANDOFF-20260724-MANGA-MINIMAL-DESIGN
status: ready_for_implementation
created: 2026-07-24
updated: 2026-07-24
owner: AI漫游项目
audience: human, ai-agent, developer, qa
source: ADR-0021
---

# 漫画成稿极简化设计 Handoff

## 最终选择

采用“兼容 Facade + 内容就绪前置”，不采用数据库重构或第二套编辑器。

普通用户只看到：

```text
打开/恢复 → 编辑或整理 → 预览并导出
```

内部继续保留：

```text
Task → Application evidence → Working Copy 或 Pending
Pending → CAS 应用/放弃 → Working Copy 保持或更新
Working Copy → Preflight → Revision → Preflight → Publication
```

## 第一实施切片

先实现“可观察、可修复的内容就绪”，不要先改页面样式。

完成定义：

1. 提取 `evaluateLayoutContentReadiness`，先以 `off/shadow` 运行，不改变旧稿可读行为；
2. `dialogueBindings=[]` 且正式来源有 16 条对白时 shadow 结果为 `contentState=blocked`；
3. 受保护人工改文计入 `userModified`，显式 suppression 计入 `userSuppressed`；
4. `invalid` 按正式 dialogue item 互斥计数，不按 issue 数计数；
5. 新增 `content.reconcile_from_storyboard`，可以通过一个可撤销 Proposal 补齐正式 binding 和气泡；
   命令密封完整规范化 dialogue ledger 并重算 digest；任何原本合法 item 都不得因“修复”退化；
6. 新增 `text.confirm_custom` / `balloon.confirm_custom`，普通改字不能冒充自定义内容；
7. 修复命令稳定后，再按 initial、Proposal、save/open、只读预览分入口启用 fail-closed；
8. 指定真实测试章不再显示为正常成稿，且原无来源气泡必须由用户保留为自定义或删除。

## 后续切片

1. 新增 `open/change/release` Facade，数据库不变；`open` 返回 opaque `draftToken`，autosave 和所有修改通过 `change` 走 CAS。
2. Web 切到聚合 session。
3. 删除 AI Drawer、MiniPreview、mode/intent、M6 四步 UI。
4. 接通一条发布链。
5. 通过完整 E2E 后删除旧 Web 直接编排和无人使用组件。

## 禁止事项

- 不删除 `LayoutCompositionApplication`。
- 不合并 Pending 与应用凭证。
- 不从 Working Copy 直接出版。
- 不把两次服务端 preflight 物理合成一次。
- 不自动覆盖旧错误稿。
- 不在内容修复命令完成前对旧 Working Copy 全面启用 fail-closed。
- 不删 V1 历史读取。
- 不引入新的漫画/图片编辑器依赖。

## 实施后真实验收

使用项目 `d14f801d-5d35-4cb1-8021-600d39ec477b`：

1. 打开指定章节时立即识别 16 条对白缺失；
2. 修复 Proposal 可预览、可放弃、可应用、可一次撤销；
3. 修复后镜头、对白和旁白闭合均为 100%；
4. 错误素材的 AI 乱码和分镜语义偏差明确返回候选图阶段，不在成稿编辑器伪修；
5. 正常发布仅需“预览并导出”和确认；
6. 正式产物与阅读预览一致。
