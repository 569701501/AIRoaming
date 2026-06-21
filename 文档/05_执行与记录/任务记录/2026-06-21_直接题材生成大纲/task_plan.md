# 直接题材生成大纲（绕过灵感种子）· task_plan

---
doc_id: AIR-TASK-2026-06-21-OUTLINE-FROM-TOPIC
status: active
created: 2026-06-21
updated: 2026-06-21
owner: AI漫游项目
audience: human, ai-agent, developer
source: 2026-06-21 讨论（"生成全职猎人暗黑大陆篇"触发不了大纲流程的根因）
---

## 1. 任务类型

流程路由优化 + 新增链路。

## 2. 背景与目标

### 背景
用户说"生成全职猎人暗黑大陆篇 10-12章节"，AI 没走大纲生成流程，只在聊天里编了 12 条剧情梗概，没落盘。根因：`shouldGenerateInspirationSeeds` 正则不认"生成 XX 篇"，且大纲生成必须依赖灵感种子。

现已 hotfix 拓宽正则（让"生成 XX 篇"能触发灵感流程）。但用户指出：**题材已经这么明确了，不该走"生成 3 个灵感种子让用户选"**，应该直接生成大纲。

### 目标
新增第 3 条剧本链路：**用户给出明确题材时，绕过灵感种子，直接生成项目级大纲**。

```
链路1（已有）：找灵感 → 3 个种子 → 用户选 → 生成大纲
链路2（已有）：上传剧本 → 整理成章节
链路3（新增）：明确题材 → 【绕过种子】→ 直接生成大纲 → 用户确认 → 生成章节
```

## 3. 非目标

- **不删除灵感种子链路**：模糊请求（"找点灵感"）仍走 3 选 1。
- **不改大纲生成后的流程**：大纲 status=draft → 用户确认 → 生成章节（走 ADR-0008 pending 缓冲），这条不变。
- **不构造虚拟种子**：不把用户输入塞进 seed 字段复用旧方法（语义污染）。用独立方法。
- **不做题材质量判断**：不判断用户题材"够不够好"，只判断"够不够明确"（是直接要内容还是找灵感）。

## 4. 关键决策

| 决策点 | 结论 | 依据 |
| --- | --- | --- |
| 题材明确怎么判断 | 复用 shouldGenerateInspirationSeeds 的正则分支：命中 directContentMatch（生成/写/编 + 故事/篇/章/剧本）= 明确 | 已改的正则天然区分两种意图 |
| 明确时怎么走 | 绕过种子，直接调大纲生成 | 用户诉求 |
| 大纲生成方法 | 新增 generateScriptOutlineFromTopicWithAI（不依赖 seed，用 input.content 当题材） | 避免 seed 字段语义污染 |
| tool 名 | generate_script_outline_from_topic（新枚举值） | 区别于 from_seed |

## 5. 阶段划分

| 阶段 | 内容 | 角色 |
| --- | --- | --- |
| P1 | shouldGenerateInspirationSeeds 返回值改造：从 boolean → `{ trigger: boolean; mode: "inspiration" \| "topic" }`，区分两种命中 | Worker |
| P2 | 新增 generateScriptOutlineFromTopicWithAI + buildScriptOutlineFromTopicPrompt（不依赖 seed，题材来自 input.content） | Worker |
| P3 | 新增 createGenerateScriptOutlineFromTopicToolResult（调 P2 + saveScriptOutlineFromAI + 存 pendingScriptOutlines） | Worker |
| P4 | tryHandleScriptInspiration 路由：mode=topic 时走 P3，mode=inspiration 时走现状 | Worker |
| P5 | DialogueToolResult.tool 加 generate_script_outline_from_topic + 前端映射 | Worker |
| P6 | Scrutiny typecheck + build | Scrutiny |
| P7 | 文档：AI上下文入口 + 完成记录 | Worker |

## 6. 退出标准

1. 用户说"生成全职猎人暗黑大陆篇"→ 直接生成大纲（不出 3 个种子）。
2. 用户说"找点灵感"→ 仍走 3 个种子（现状不变）。
3. typecheck + build 通过。
4. 文档同步。

## 7. 风险

| 风险 | 应对 |
| --- | --- |
| 正则误判（把模糊请求当明确题材） | directContentMatch 要求同时含动词(生成/写/编)和内容词(故事/篇/章/剧本)，双重限定降低误判 |
| 题材生成的大纲质量 | prompt 把用户原话完整传入，AI 据此规划；质量靠 prompt 引导 |
| 用户题材理解偏差 | 大纲 status=draft，用户确认前不生效，可重生 |
