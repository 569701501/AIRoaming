---
doc_id: AIR-REVIEW-20260717-DUAL-STORYBOARD-PROMPT-V22-RUNTIME
status: pass_with_caveat
created: 2026-07-17
updated: 2026-07-17
owner: AI漫游项目
audience: human, ai-agent, developer, qa
source: 无头浏览器、API、SQLite 与 OpenCode 会话
---

# V2.2 运行与用户路径复核

## 运行路径

1. 在独立 V2.2 runtime 启动 API 4338、Web 5198，保持任务 worker 关闭。
2. 分别打开 AI 创作项目和已有剧本导入项目的分镜工作台。
3. 两边输入同一句 `请生成当前章节完整分镜，漫画和漫剧都要完整。`
4. AI 创作生成 23 个待确认镜头；已有剧本导入生成 11 个待确认镜头。
5. 不点击确认，直接读取 Working Copy、正式正文、剧情结构和运行时会话进行复核。

## 结果

- 两个页面均显示“待确认”，用户仍能逐镜查看；没有自动正式化。
- AI 路线和导入路线均首次生成完成，没有进入一次修复。
- 两路结构引用合法；页面 console 0 error / 0 warn。
- 数据库 2 个 StoryboardVersion 均为 `pending_confirmation`，confirmed 为 0。
- 11 个历史后台任务保持 queued；付费媒体任务 running/succeeded 为 0。

## 用户可见结论

页面流程本身正确，V2.2 输出也能正常查看；问题出在生成内容质量的取舍，不是页面、保存或确认链故障。AI 样本镜头更清楚，但对白明显过载，因此用户不应把这两份 pending 当作新正式基线。
