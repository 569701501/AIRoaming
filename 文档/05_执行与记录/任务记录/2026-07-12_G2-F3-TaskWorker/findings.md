---
doc_id: AIR-G2-F3-FINDINGS-001
status: completed
created: 2026-07-12
updated: 2026-07-12
owner: AI漫游项目
audience: human, ai-agent
source: G2 F3 implementation
---

# 关键结论

- completion guard 必须使用同一 Prisma transaction reader，否则 guard 通过后到 apply 之间会出现 TOCTOU 窗口。
- provider 原始文本不写入版本表；先解析并 strict encode，再生成 `VersionDocumentTaskOutputV2`。
- `story_parse` 的写目标是 active pending StoryVersion；`shot_generate` 的写目标是 active pending StoryboardVersion。两者都不在 worker 中确认 current。
- historical 结果仍进入任务 output 与 Attempt 记录，但不更新版本文档、current pointer 或 projection。
- worker 默认只在主进程 DB mode 启动；测试和嵌入式 Nest context 使用 `runOnce`，避免自动 provider 竞态。

# 残留风险

- OpenCode provider 的真实服务、凭据和模型输出尚未在 CI/本地执行；测试使用 deterministic handler。
- `shot_generate` provider 当前被提示只能引用已有 Shot id；新镜头批量建模需后续显式设计。
