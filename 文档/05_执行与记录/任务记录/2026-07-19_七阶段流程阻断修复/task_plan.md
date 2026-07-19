---
doc_id: AIR-TASK-20260719-WORKFLOW-BLOCK-PLAN
status: completed
created: 2026-07-19
updated: 2026-07-19
owner: AI漫游项目
audience: human, ai-agent, developer
source: 用户真实页面截图与 DB-only 当前项目运行证据
---

# 目标

恢复当前七阶段页面的正常推进能力，首先关闭用户已遇到的三个真实阻断：

1. `needs_confirmation/needs_update` 阶段在顶部流程栏消失或不可点击。
2. 正式产物已存在时，旧对话过程卡仍把当前状态显示成待确认并诱导重复生成。
3. DB SceneVisual 已生成但剧情结构页面不回显。

# 非目标

- 不重做七阶段产品流程。
- 不改变 StoryVersion/StoryboardVersion 的不可变版本语义。
- 不重新调用图片 Provider。
- 不修改用户现有分镜内容；真实复核只确认用户已要求继续推进的 12 镜待确认版本，不触发任何付费图片生成。

# 验收标准

- 第 3 步“分镜工作台”在 `needs_confirmation` 时完整可见且可点击。
- `needs_update` 的可处理阶段同样可见且可进入；`waiting/blocked` 仍不可越级。
- 当前项目可从剧情结构页面正常点击进入 12 镜待确认分镜。
- 5 个 SceneVisual 在剧情结构页面回显，且不改写正式 StoryVersion 文档。
- 正式剧情结构不再被旧对话结果冒充为当前待确认状态。
- 自动化测试、类型检查与真实浏览器路径均通过。

# 阶段

## 阶段 1：可重复失败信号

在 DB E2E 真实 Working Copy 路径增加 `needs_confirmation` 阶段栏断言，先证明修复前失败。

退出标准：测试稳定复现“分镜步骤禁用/不可见”。

## 阶段 2：阶段栏修复

统一阶段可选择规则和样式，覆盖 `done/active/needs_confirmation/needs_update/waiting/blocked`。

退出标准：定向 E2E 通过，等待态仍不可点击。

## 阶段 3：场景图投影修复

DB read model 加载 ChapterScene/SceneVisual，将 current SceneVisual 的 assetId 只读投影到 WorkbenchSnapshot 的 scene card。

退出标准：数据库版本不变，页面能看到 5 张当前场景图，服务端有回归测试。

## 阶段 4：对话状态一致性

核对对话结果卡和当前 Workflow/Working Copy 的显示优先级；正式产物或已确认后续产物存在时，不再把历史过程卡解释为当前待确认动作。

退出标准：用户输入“确认采用当前剧情结构”不会触发重复生成提示；当前状态由正式 StoryVersion/Workflow 表达。

## 阶段 5：复核与交付

执行静态测试、真实页面路径和用户当前项目复核，补完成记录与长期记忆。

退出标准：Scrutiny Review 与 Runtime Review 均有结论，当前浏览器停在正确可操作阶段。
