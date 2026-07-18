---
doc_id: AIR-RUNTIME-20260718-PROJECT-NAME-CREATIVE-ISOLATION
status: passed_with_manual_observation
created: 2026-07-18
updated: 2026-07-18
owner: AI漫游项目
audience: human, ai-agent, developer, qa
source: 项目名与创作内容隔离运行复核
---

# 运行复核

## 自动运行结论

`通过`

- 使用管理名哨兵 `管理代号-1111` 运行真实生产 Prompt 构造器，A2/A3/A4/A5/通用对话/剧情结构/分镜/后台任务/角色参考图均不包含该名称。
- 当用户本轮明确写出同名文本时，文本仍从用户消息正常进入 A2，不做错误关键词过滤。
- 使用真实 SQLite 创建两个只填写项目名的新项目并重启应用上下文，DTO 中 `storyTitle/description` 保持空字符串，数据库列保持 `NULL`。
- 旧项目的 `storyTitle` 与管理名同值时，剧情结构、分镜和角色参考图 Prompt 显示“未确认”，不回写数据库。

## 未执行项

- 未调用真实文本模型或图片 provider，避免产生费用。
- 页面没有代码变化，因此未做浏览器视觉回归。

## 用户最终观察

重启当前应用/服务后，进入原 `1111` 项目，在灵感种子处点击“换一批”或重新要求生成。新候选不应围绕数字 `1111` 展开；旧候选和旧对话不会被自动重写。
