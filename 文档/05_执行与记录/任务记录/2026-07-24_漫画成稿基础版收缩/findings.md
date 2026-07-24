---
doc_id: AIR-FINDINGS-20260724-MANGA-BASIC-CUT
status: active
created: 2026-07-24
updated: 2026-07-24
owner: AI漫游项目
audience: human, ai-agent, developer, qa
source: 漫画成稿基础版收缩代码探索
---

# 发现

## 当前真实行为

- `LayoutExportWorkspace.vue` 同时包含自动排版、专业画布、二次智能调整、来源返修、版本历史和四步出版，普通用户认知负担过高。
- 无 Working Copy 且来源 gate 允许时，页面 watcher 自动启动 `layout_compose mode=initial`。
- initial worker 使用正式 Storyboard、定稿图片、字体和角色目录；Shared 把 `motion.voiceLines`、`comic.dialogue`、`comic.caption` 归一化为 dialogue ledger。
- fresh initial 在写 Working Copy 前要求每个 ledger item 有唯一气泡、镜头/说话者/类型一致、文字摘要与原文一致。
- `full_reflow/scoped_reflow` 是后续建议能力，主要调整几何、裁切、气泡样式和尾巴，不能可靠修复历史 `dialogueBindings=[]`。
- Working Copy 加载与手机只读预览不会运行 V2 dialogue coverage；因此历史错误稿仍可能看起来正常。
- 当前正式导出 UI 暴露“成稿预检 → Revision → 出版预检 → Publication”四步，底层安全必要，但不应由普通用户编排。

## 关键取舍

- 复用现有 V2 preflight 作为导出文字正确性唯一判断，不新建第二套账本。
- 扩展 preflight issue 的用户可读证据，不改变正式 binding/protection 事实。
- 用户主动修改属于可确认差异；没有合法用户所有权的额外文字属于系统错误。
- 保留底层 Revision/Publication，不保留用户可见版本中心。

## 当前风险

- 旧合同测试已按基础产品事实重写；历史 Shared/Server full/scoped 能力仍保留兼容读取，但普通 Web 不再创建对应请求。
- 具体编辑工具本轮不重做；属性区仍偏专业，后续只能围绕真实逐项编辑任务单独简化，不能重新引入二次 AI 或复杂发布流程。
- 规则 fallback 初稿只保证内容与保守几何，不等同于专业审美；当前真实章节可作为可手调粗稿，不能宣称无需人工检查。
- 测试章节已由错误旧稿重建为 19/19 正式 binding；此前“旧错误稿可正常预览”的证据仍保留在 ADR-0021，不应误当成当前成稿。

## 实施后事实

- 正式文字完整性由同一 V2 preflight 统一判断，没有第二套账本。
- `CUSTOM_TEXT_PRESENT` 只接受带用户 existence/text（气泡还含 source）证据的可见自定义对象；无所有权对象为 `UNOWNED_TEXT_PRESENT` blocker。
- 正式气泡完全离开所属画布、隐藏或透明度为 0 时不能导出；用户明确 suppress 则转为可确认差异。
- 画布/profile resize 不再给旧无来源文字“洗”出用户所有权。
- 单一导出对 Revision 和 Publication 的网络歧义均保留原幂等请求；Publication 快照采用单调状态合并，终态不回退。
- 真实 V2 初稿为 9 段、11 镜头、19 条正式绑定；只读页 DOM 与人工逐段检查均为 19/19。
