---
doc_id: AIR-FINDINGS-20260716-STORY-STRUCTURE-QUALITY
status: completed
created: 2026-07-16
updated: 2026-07-16
owner: AI漫游项目
audience: human, ai-agent, developer, qa
source: 剧情结构运行时代码与 A+ 双流程契约
---

# 剧情结构质量门发现

## 已确认事实

- 双流程汇合点是已确认的 `ChapterScriptVersion`。
- StoryStructure 必须绑定精确 `sourceScriptVersionId`；现有 payload 和页面字段保持不变。
- 当前 `buildStoryStructurePrompt` 已说明字段形状、角色层级、场景和 beat 粒度，但重点仍是格式约束。
- 当前生产路径对模型结果执行解析和 normalize，然后直接创建内存待确认结构。

## 待核实缺口

- 当前 `parseStoryStructureJson` 会把缺失字段规范化为空字符串或默认名称，并对非法 `level/entityType` 直接类型断言；没有生产级严格拒绝。
- beat 的 `sceneName` 找不到时会变为 `sceneId=null`；beat 人物名没有校验是否存在于角色卡。
- 当前没有剧情结构专用的 Prompt/服务编排测试，也没有失败后的定向修复预算；一次解析成功就创建待确认预览。
- DB Working Copy 在用户确认时有严格 V2 文档校验，但它主要检查字段形状、ID 和顺序，不能替代模型输出进入预览前的正文覆盖检查。
- 正式章节正文已经有固定六段 Markdown 和连续场景，可作为确定性覆盖事实源：场景名、地点、时间、出场人物和章级方向均可解析。

## 风险边界

- 不能把项目大纲的计划内容当成本章实际发生内容。
- 不能用简单关键词覆盖率声称完成完整艺术判断。
- 不应为增强质量改动页面、Schema 或确认流程。

## 实施决策

- 新增 Server 内部剧情结构质量校验，不新增 Shared Schema 或公开 Skill。
- 高置信检查限定为：必需内容非空、合法角色枚举、场景完整且顺序对应正文、beat 顺序连续、每个正文场景至少一个 beat、beat 引用只指向已有场景和角色、重复空壳事件拒绝。
- 项目大纲只在 Prompt 中作为世界背景；正文的场景与本章结尾是实际事件的最高证据，方向块用于交叉核对。
- 首次格式或质量失败共用一次定向修复预算；第二次失败直接返回失败结果，不创建 pending。

## Worker 中发现的来源风险

- DB Workbench 的 `currentChapter.sourceText` 是 Script Working Copy 文本；当用户有未发布修改时，它可能不同于 `currentScriptVersionId` 指向的正式正文。
- 剧情结构旧实现直接读取该文本，却把结构来源绑定到正式版本 ID，存在“内容来自新草稿、来源却写旧版本”的风险。
- 处理：DB 模式生成前读取 Script Working Copy，只有 `state=clean` 且 current ID 一致才继续；随后按 current ID 读取正式历史正文作为 Prompt 和质量门唯一来源。待确认剧本 pending、dirty Working Copy 或版本变化都在模型调用前阻断。file-mode 保持原兼容读取。

## 最终复核

- Scrutiny Review：通过，无 P0/P1 缺口。
- Runtime/User Review：现有 DB-only 页面路径 1/1 通过。
- 残留风险仅为艺术判断和历史非固定 Markdown 的逐场覆盖能力，不影响当前固定格式主路径。
