---
doc_id: AIR-TASK-20260723-LAYOUT-REGENERATE-FINDINGS
status: completed
created: 2026-07-23
updated: 2026-07-23
owner: AI漫游项目
audience: human, ai-agent
source: 重生成漫画成稿草稿探索与复核
---

# 发现

## 1. 需求理解

用户要求不保留旧漫画草稿备份，删除当前旧版成稿 Working Copy，并从现有上游正式来源重新生成。

## 2. 关键事实

- 当前不可点击智能调整的直接原因是 Working Copy 为 `LayoutDocumentV1`。
- `initial layout_compose` 的合法前置是当前章节不存在 Working Copy；它不会重做上游图片。
- 既有正式 LayoutRevision/出版记录是历史事实，不是当前可变草稿；删除它们既无必要，也会扩大破坏范围。
- 用户打开的旧页面可能保留过期内存状态；数据库重生成后需要刷新或重新进入漫画成稿。

## 3. 风险控制

- 删除前必须再次确认目标 Working Copy ID、章节作用域、无 active layout task 和无 active pending command。
- 删除后若任务创建失败，不恢复旧草稿；保留“无 Working Copy”状态并继续修复上游门禁，符合用户“不保留旧稿”的决定。
- 任务 apply 前必须确认 source projection current；失败时不得直接手写 V2 文档。

## 4. 复核结论

- 新任务未获得视觉分析 Provider，11 个镜头全部为 `rule_fallback`，警告均为 `visual_analysis_not_configured`；没有发生外部视觉调用。
- 新 V2 Working Copy、任务和应用凭证严格属于同一 project/chapter，任务和应用摘要一致。
- 页面“重新排一版”“智能调整”均已启用；画格人工属性和裁切属性可编辑。
- 旧 V1 Working Copy 已不存在，也没有创建其备份副本。

## 5. 结果与限制

- 自动成稿完整性达标：11/11 镜头、19/19 对白/旁白，9 个条漫段落。
- 视觉质量不能按“视觉 AI 已理解人物、脸、关键动作和文字安全区”签收。当前只是可继续编辑和可再次智能调整的规则版初稿。
- 用户浏览器如果仍停留在旧页面，可能保留 V1 内存状态；必须刷新或重新进入“漫画成稿”后读取新 V2。
