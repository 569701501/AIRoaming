# OpenCodeAI 技能基座

---
doc_id: AIR-EXEC-COMPLETION-20260527-OPENCODEAI-SKILL-BASE
status: active
created: 2026-05-27
updated: 2026-05-27
owner: AI漫游项目
audience: human, ai-agent, developer
source: 用户要求、AuroraPlatformWeb opencodeAI 结构参考、剧本对话功能再设计方案
---

## 1. 功能摘要

AI漫游新增 `apps/server/opencodeAI` 源码资产目录，开始按 `agents / skills / tools` 组织 OpenCode AI 能力，并落地第一个剧本导入 skill：`script-import-normalize`。

## 2. 背景

用户指出 AuroraPlatformWeb 已在项目内维护 `opencodeAI`，包含 agents、skills、tools。AI漫游后续每个流程也需要逐步添加对应工具和技能，不能只靠普通对话 prompt。

同时，用户发现上传非剧本文档时当前导入逻辑会因为 `1`、`2`、`3` 等编号直接拆章写入，因此剧本导入需要先由 AI 做内容识别和格式校验。

## 3. 影响范围

- 新增 OpenCode AI 资产源码层。
- 新增剧本阶段协作 agent 初版。
- 新增剧本导入分析/整理 skill。
- 明确后续 tools 目录只放受控业务工具封装，不直接暴露本地物理路径。
- 更新 OpenCode 运行时方案、剧本对话方案、核心数据模型和模块梳理。

## 4. 修改文件

```text
apps/server/opencodeAI/README.md
apps/server/opencodeAI/AGENTS.md.tpl
apps/server/opencodeAI/opencode.json
apps/server/opencodeAI/agents/airoaming__script-collaboration-agent.md
apps/server/opencodeAI/skills/script-import-normalize/SKILL.md
apps/server/opencodeAI/tools/README.md
文档/02_架构与契约/核心数据模型.md
文档/03_模块梳理/模块总览与依赖.md
文档/04_方案与决策/2026-05-25_OpenCode对话运行时移植方案.md
文档/04_方案与决策/2026-05-27_剧本对话功能再设计方案.md
文档/05_执行与记录/功能完成记录/README.md
```

## 5. 数据或协议变化

- 未新增 TypeScript DTO。
- 文档契约新增：`import_script_to_chapters` 前应先经过 `script-import-normalize` / `analyze_script_import` 导入前分析。
- 低可信章节边界，例如单独成行的 `1`、`2`、`3` 或 `# 1`，不能绕过内容校验直接写入章节。
- `apps/server/opencodeAI` 目前是源码资产层；运行时模板复制、OpenCode tool bridge 和真实 `analyze_script_import` 工具仍未接入。

## 6. 验证结果

```text
git diff --check
node -e "JSON.parse(require('fs').readFileSync('apps/server/opencodeAI/opencode.json','utf8')); console.log('opencodeAI json ok')"
```

结果：

- `git diff --check` 通过。
- `opencode.json` JSON 解析通过。

## 7. 已知风险

- 目前只落了 agent/skill/tool 目录和文档，OpenCodeRuntimeService 尚未读取并注入本目录。
- `script-import-normalize` 还只是技能契约，后端实际导入逻辑仍需补 `analyze_script_import` 或等价前置校验。
- `opencode.json` 当前按禁止外部目录、bash 和 edit 的保守模板放置，真实接入时还需要结合 OpenCode 版本和运行方式校验配置字段。

## 8. 后续建议

1. 接 `analyze_script_import`：先分析内容类型和章节边界，失败时不写章节。
2. 调整现有导入链路：只有分析通过才调用 `import_script_to_chapters`。
3. 增加 OpenCode 模板服务：将 `apps/server/opencodeAI` 同步到 OpenCode session 配置目录。
4. 后续按流程补 `structure-*`、`storyboard-*`、`image-*`、`layout-*`、`asset-*` skill 和对应受控工具。
