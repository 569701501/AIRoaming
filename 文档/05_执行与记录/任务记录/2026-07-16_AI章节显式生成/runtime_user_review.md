---
doc_id: AIR-REVIEW-20260716-AI-CHAPTER-EXPLICIT-RUNTIME
status: passed
created: 2026-07-16
updated: 2026-07-16
owner: AI漫游项目
audience: human, ai-agent, developer
source: DB-only Playwright 用户路径与 fresh SQLite 集成测试
---

# 运行与用户路径复核

结论：`passed`。

## 验证路径

1. 在新项目中输入明确的两章悬疑题材，生成严格项目大纲和两张章节卡。
2. 回复裸“继续”：大纲转为 confirmed，模型调用次数不增加，当前章没有 pending。
3. 明确输入“生成当前章节”：只调用一次章节生成，产生第 1 章 AI pending。
4. 页面正文区可从首场一直读到最后的下一章引子；采用/丢弃可见，pending 阶段“完成本章”禁用。
5. 采用后 pending 消失，Working Copy 可完成；点击“完成本章”后页面仍停在第 1 章。
6. 完成提示只显示“进入本章剧情结构”，章节下拉框出现大纲中的第 2 章“封闭总站”。
7. 用户主动切换到第 2 章后没有 pending、没有模型调用，“完成本章”保持禁用，证明切章不生成。

## 结果

- DB-only Chromium：1/1 通过。
- 来源与状态 fresh SQLite：2/2 通过。
- 章节作用域对话 pending 持久化：1/1 通过。
- 未访问真实外部模型、真实用户数据或非测试目录。
