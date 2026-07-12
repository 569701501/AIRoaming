---
doc_id: AIR-G3-M3-A6-SCRUTINY-001
status: completed
created: 2026-07-12
updated: 2026-07-12
owner: AI漫游项目
audience: human, ai-agent, qa
source: A6 静态复核
---

# Scrutiny Review

- importer 只读取 sealed snapshot，沿用决议 digest 与 A2/A3/A5 target；未新增 workspace 直读或 final path。
- Storyboard source id/digest、Shot 稳定 ID、projection scope、source/payload digest 和 replay conflict 已覆盖。
- pending pointer、Shot/Projection、confirmed、current 更新顺序符合 G1/G2 trigger。
- 未导入角色时拒绝非空 characterIds，未把 lockedCandidate/status 偷带进 V2 文档。
