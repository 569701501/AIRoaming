---
doc_id: AIR-TASK-20260717-STORYBOARD-BEAT-SEMANTIC-EVAL-EVIDENCE
status: completed
created: 2026-07-17
updated: 2026-07-17
owner: AI漫游项目
audience: human, ai-agent, developer, qa
source: V2.3 隔离数据库、四次真实文本模型报告
---

# 分镜 Beat 语义评测证据复核

## 输入身份

| 路线 | Project | StoryVersion | StoryboardVersion | 状态 |
| --- | --- | --- | --- | --- |
| AI 创作 | `dfb3aa62-6447-45bf-aee4-6aeea6476149` | `f00e48ce-e070-46d8-9ab7-7b20ac8f1515` | `9d5dc743-aac8-4c97-bb7e-e489a5b5bb27` | `pending_confirmation` |
| 已有剧本导入 | `76e071bd-7e97-4ed5-8de1-06ab590c9f51` | `34835ca7-ed9d-47ee-a087-53d09e5fb42c` | `daed665f-4ac8-4477-9876-416ea05e7eb1` | `pending_confirmation` |

精确身份来自 V2.3 `evidence/metrics.json`；本轮评测输入由对应数据库版本原样导出。输入 SHA-256：

- AI StoryStructure：`520a9998b678d6ad3c483bc2670ed1d3b99e7959898b8cbab11f8247ff604f49`
- AI Storyboard：`d2a939ea346a6da35f86d629cfb8228b431e8fef701f5d83f4223abbed268959`
- 导入 StoryStructure：`d5a29fe30f1f67c0f805b71930fd8fbbac9cde1d6659c3172a00f9f23a5b8974`
- 导入 Storyboard：`e2b559321124955e6ba5673e6d775158bba90e9aa2a7cf7fde7e352c2b8932f7`

## 运行条件

- 模型：`self/gpt-5.5`。
- 每条路线独立运行两次，共 4 次纯文本模型调用。
- OpenCode 会话使用 deny-all 权限。
- 未调用图片、视频、TTS、字幕、排版或其他付费媒体服务。

## 报告与摘要

| 报告 | covered | partial | missing | contradicted | SHA-256 |
| --- | ---: | ---: | ---: | ---: | --- |
| `ai-v23-semantic-report.json` | 20 | 6 | 0 | 0 | `32b2a5155345182760c1d3e99b1d6dea08cf9e1fdd7991ccc6c5895c31436dd4` |
| `ai-v23-semantic-report-repeat.json` | 20 | 6 | 0 | 0 | `89d73c7bcb9ef1191d520522d41de1bd11b9c48a30c091ecf83f170c7b81265d` |
| `import-v23-semantic-report.json` | 12 | 4 | 0 | 0 | `3eb783fe2ddaa93661b25fcd479b3b27218ec91e8b12d19e35203f9ef7bb8640` |
| `import-v23-semantic-report-repeat.json` | 10 | 6 | 0 | 0 | `58dc9569c7d4b6f9ad6cd1770105db8d982b9d0219a0d91d595fe900861ae4ef` |

四份报告均通过严格 parser；报告中的 `overallStatus=warning` 是本地根据 partial 派生，不是模型自报。

## 安全复核

评测后数据库仍只有两个 `pending_confirmation` StoryboardVersion。11 个既有生成任务仍全部为 `queued`，`running/succeeded=0`；评测只新增本目录报告文件。
