# 剧本大纲确认链路进展

---
doc_id: AIR-TASK-SCRIPT-OUTLINE-CONFIRM-PROGRESS-001
status: active
created: 2026-05-29
updated: 2026-05-29
owner: AI漫游项目
audience: human, ai-agent
source: 剧本大纲确认链路实现记录
---

## 2026-05-29

- 更新产品、架构和方案文档，明确项目级「剧本大纲」固定格式。
- 新增共享 DTO `ProjectScriptOutline`，扩展对话 intent/tool result。
- 后端新增 `script-outline.md` / `script-outline.json` 读写和 workbench 快照暴露。
- 对话链路改为：选择灵感种子后生成大纲；确认大纲后调用章节起草并只写当前章。
- 前端灵感卡按钮改为“生成大纲”，大纲结果卡支持“确认并生成当前章”。

## 验证

```text
corepack pnpm --filter @airoaming/shared typecheck
corepack pnpm --filter @airoaming/shared build
corepack pnpm --filter @airoaming/server typecheck
corepack pnpm --filter @airoaming/web typecheck
```

结果：通过。

接口烟测：

- `GET http://localhost:4310/api/health`：成功。
- `GET http://localhost:4310/api/projects/{projectId}/workbench`：成功，返回 `snapshot.scriptOutline` 字段。

## Handoff

后续如要继续增强，可补大纲版本历史、大纲独立查看入口和基于已确认大纲逐章生成后续章节。
