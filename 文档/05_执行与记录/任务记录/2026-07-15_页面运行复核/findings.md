---
doc_id: AIR-TASK-20260715-PAGE-RUNTIME-FINDINGS
status: completed
created: 2026-07-15
updated: 2026-07-15
owner: AI漫游项目
audience: human, ai-agent, developer, qa
source: 页面、控制台、网络与代码探索
---

# 探索发现

## F-01：隔离页面环境可复用

- E2E runtime 为每次运行生成唯一 runId、端口、临时数据库和 workspace。
- provider、server、web 只绑定 loopback；浏览器网络守卫禁止外网请求。
- 当前页面测试可在不触碰真实项目和真实凭据的前提下完成。

## F-02：现有页面覆盖

- 基础页面已有项目库、项目创建、工作区和七阶段流程栏。
- G4 已有候选收藏/废弃、定稿影响确认、冲突重算和历史入口。
- G5 已有 DB Working Copy、成稿编辑、来源替换、不可变版本、正式出版、手机只读和 AI Pending。

## F-03：剧情结构页面的 fake provider 契约缺口

- 复现：完成章节剧本后点击“生成剧情结构”，页面稳定报错“AI 返回中没有可解析的 JSON 灵感种子”。
- 根因：E2E fake provider 对所有 OpenCode prompt 只返回 `E2E deterministic response`，没有覆盖真实 `structure-story-parse` 协议；生产解析器选择正确。
- 修复：fake provider 读取 message payload，仅在结构技能 prompt 下返回确定性的 fenced JSON；单测先红后绿，最终 3/3 通过。
- 辅助修复：共享 JSON 提取失败文案改为“没有可解析的 JSON 内容”。

## F-04：DB 剧情结构确认丢失角色同步

- 复现：结构预览生成成功后点击“确认结构”，数据库没有 pending/current StoryVersion，页面也没有可见错误。
- 调试边界显示实际错误为“角色『林夏』尚未绑定项目角色库”。
- 根因：旧文件态 `confirmChapterStoryStructure` 会按角色名匹配/新建角色并回填 ID；DB Working Copy 前端适配器要求角色必须已存在，迁移时漏接了 ADR-0006 的自动同步语义。
- 修复：请求态使用 `unresolved-story-character:<normalized-name>` 临时引用；DB repository 在 Working Copy 更新事务内按标准化名称复用/创建角色并把持久文档改写为真实 `Character.id`。临时引用不会落入持久 StoryVersion。
- 同时将剧情节拍中的角色名映射为结构卡 ID，满足 StoryDocument V2 的引用约束；确认摘要使用服务端返回的实际 pending digest。

## F-05：角色预览任务与 DB 角色列表缓存

- 手工页面确认后角色已入库，但任务队列仍为 0，和“自动排队第一张角色图”的产品口径不一致。
- 根因：`listProjectCharacters` 在 DB 模式仍读 ProjectStore 旧缓存，确认后任务编排看不到刚创建的角色。
- 修复：DB 模式角色列表强制 `refreshProjectFromDatabase`；Story Working Copy 确认后为缺少预览的结构角色补排 `preview_front` 持久任务。
- 容错：角色图排队失败只写 warning，不回滚已成功的剧情结构确认；用户仍可在角色卡手动重试。

## F-06：错误可见性

- 项目工作台原先只把 `dialogueError` 传入左侧错误区，一般 store `error` 在 snapshot 已加载时不可见，导致按钮失败像“没反应”。
- 修复后项目工作台显示 `dialogueError || error`，保留原有对话错误优先级并让业务写失败可见。

## F-07：G4/G5 运行结论

- G4 候选决策浏览器用例通过，覆盖收藏/废弃、影响预览、commit、双窗口冲突、历史与下游 stale。
- G5 M4～M8 浏览器用例通过，覆盖模板/裁切、字体/IME/气泡、来源返修/历史、手机只读/AI Pending、正式出版与产物读取。
- 正式出版用例读取 PNG 后服务端偶发 `ERR_STREAM_PREMATURE_CLOSE`，但 HTTP 200、MIME、PNG 魔数、三类 ExportArtifact 与数据库 task 状态均通过；当前归类为非阻塞日志债。

## 风险

- 本轮使用 fake provider，只证明协议、状态、页面和 DB 链路，不等价于真实模型内容质量验收。
- 角色预览图自动排队采用“结构确认成功优先”的 best-effort 策略；provider 暂时不可用时需要依赖任务重试或角色卡手动重试。
