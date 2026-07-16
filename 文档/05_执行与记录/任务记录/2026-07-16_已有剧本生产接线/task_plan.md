---
doc_id: AIR-TASK-20260716-SCRIPT-IMPORT-PRODUCTION-PLAN
status: completed
created: 2026-07-16
updated: 2026-07-16
owner: AI漫游项目
audience: human, ai-agent, developer
source: 双流程来源与状态契约、A+ B1～B5 用户决策
---

# 目标

在不改变剧本页现有内容字段的前提下，把已有完整剧本路线 B1～B5 接入真实 DB-only 生产链。

# 非目标

- 不新增 ChapterPlan。
- 不提供导入章节的手动编辑、采用、丢弃、AI 重新整理或批量确认。
- 不修改 StoryStructure payload、页面字段或下游生产流程。
- 不复活旧 file-mode 整本覆盖入口。
- 不把技术重试包装成用户可见的剧情改写能力。

# 阶段

1. B1/B2：保存不可变原稿，生成严格观察性大纲、拆章候选和阻断问题。
2. B3：结果卡展示最新候选；用户整体确认一次，创建不可变 ChapterMap、全部章节入口和 ImportBatch。
3. B4：逐章读取确认范围，生成固定章节剧本，执行严格忠实度验证；成功生成 import pending，失败隔离记录。
4. B5：用户自由切章完整只读查看；单章“确认章节”直接发布正式版本并解锁 StoryStructure。
5. 复核：单元、fresh SQLite 集成、DB-only Chromium、静态门禁、Scrutiny、Runtime Review、文档和提交。

# 关键决策

- 0017 是唯一来源和批次事实源；旧 `ScriptImportAnalysis` 只保留历史兼容，不参与新 DB 导入。
- 每个模型阶段严格解析，最多一次只修格式重试；分析和验证 JSON 不接受代码围栏。
- 目录确认只确认最新 active candidate；存在来源范围、文件顺序或章节边界阻断问题时禁止启动批次。
- 单章必须先 materialize，再 verify；只有无硬性忠实度问题才创建 `kind=import` pending。
- import pending 只允许“确认章节”；确认事务直接形成 `origin=import` 的正式版本，不经过 Working Copy。
- 页面只增加状态投影和动作差异，不新增用户内容字段。

# 验收标准

- 上传或粘贴原稿后，原稿副本和稳定 block 引用先于模型分析落库。
- 对话结果卡能展示观察性摘要、章节数量、标题、边界证据、置信度、警告和阻断项。
- 点击或回复确认拆章目录，只确认一次并创建目录中的全部章节入口。
- 所有章节至少完成一次整理/验证尝试；成功项拥有密封 import pending，失败项不影响其他章节。
- import pending 在现有正文区全文只读，只显示“确认章节”，不显示采用、丢弃、保存或完成本章。
- 确认某章后形成正式 `ChapterScriptVersion(origin=import)`，页面停留当前章并允许进入 StoryStructure；其他章状态不阻塞。
- 关键反向行为有自动测试：不能采用/丢弃 import pending，不能确认有硬问题的稿件，不能批量确认。

# 退出标准

- 所有阶段完成并记录验证证据。
- Scrutiny Review 与 Runtime/User Review 有明确结论。
- 产品、架构、模块、完成记录、会话记忆和长期记忆同步。
- 独立提交，工作树干净。

# 完成结论

B1～B5 已按上述范围完成。生产实现、严格契约、页面动作、DB-only 浏览器路径、Scrutiny Review、Runtime/User Review 和正式文档均已收口；保留的增强项只有超长稿分层、后台断点续跑和失败项重试入口，不影响当前正常长度原稿的完整流程。
