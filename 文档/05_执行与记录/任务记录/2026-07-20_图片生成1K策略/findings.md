---
doc_id: AIR-TASK-20260720-IMG-1K-FINDINGS
status: completed
created: 2026-07-20
updated: 2026-07-20
owner: AI漫游项目
audience: human, ai-agent
source: 代码、项目事实源与 Provider 官方文档
---

# 探索发现

## 代码事实

- `apps/server/src/projects/image-provider.service.ts` 的 Grok 文生图请求固定发送 `resolution: "2k"`。
- Grok 单图编辑和多图编辑没有显式发送 `resolution`，不能保证全部路径遵循相同成本策略。
- 候选图 `requestedSize` 当前为竖版 `1024x1536` 或横版 `1536x1024`，它用于比例、来源冻结和结果校验；Grok 仍会另读 `resolution` 决定输出档位。
- 当前设置数据库没有通用 Provider options JSON；为单一参数新增设置页会引入 Schema/迁移和错误的跨 Provider 抽象。

## 官方资料

- xAI 官方支持图片 `resolution=1k|2k`；quality 模型 1K/2K 的公开价格分别为每张 0.05/0.07 美元。
- OpenAI 图片模型使用离散像素 `size` 和 `quality`。
- 豆包/火山引擎使用像素 `size` 或 width/height，不能直接复用 Grok 的 resolution 枚举。

来源：

- `https://docs.x.ai/developers/model-capabilities/images/generation`
- `https://docs.x.ai/developers/pricing`
- `https://platform.openai.com/docs/api-reference/responses-streaming/response/image_generation_call/completed`
- `https://api.volcengine.com/api-docs/view?action=ImageGenerations&serviceCode=ark&version=2024-01-01`

## 结论

在 Grok provider 边界增加默认 1K、环境变量可覆盖为 2K，是当前最小且语义正确的方案；三类 Grok 请求必须同时覆盖，非法配置必须在联网前失败。

## 实现结果

- 默认值已从硬编码 2K 收口为统一的 1K 运行策略。
- 单图编辑和多图编辑也补齐显式分辨率，避免依赖 Provider 默认值。
- 环境变量只在当前 Provider 为 Grok 时解析，不影响 OpenAI、豆包启动与请求。
