# Grok 生图设置发现记录

---
doc_id: AIR-TASK-20260709-GROK-IMAGE-PROVIDER-FINDINGS
status: completed
created: 2026-07-09
updated: 2026-07-09
owner: AI漫游项目
audience: human, ai-agent
source: 项目事实源、代码探索、xAI 官方文档
---

## 需求理解

用户已经把 Grok 生图中转准备好，希望在设置里的图片生成模型中添加 Grok，并强调需要一个一个生成、记得队列。

## 代码发现

- 修改前 `packages/shared/src/dto.ts` 中 `ImageProviderType = "openai" | "doubao"`；本次已扩展为 `openai | doubao | grok`。
- `apps/server/src/settings/settings.service.ts` 管理 `openaiImageProvider`、`doubaoImageProvider` 和 `activeImageProvider`，本地保存到 `workspace/settings/app-settings.json`。
- `apps/server/src/projects/image-provider.service.ts` 已有 OpenAI 兼容 `/images/generations` / `/images/edits` 分支和豆包分支。
- `apps/server/src/projects/image-candidate.service.ts` 使用 `imageQueue` 串行执行 `image_generate`。
- `apps/server/src/projects/character-reference.service.ts` 角色参考图和场景参考图也用队列串行执行。
- `apps/web/src/components/settings/AppSettingsView.vue` 只展示 OpenAI / 豆包两种图片生成服务商。

## 网络发现

- xAI 官方 Image Generation 文档示例使用 `POST https://api.x.ai/v1/images/generations`。
- 推荐模型为 `grok-imagine-image-quality`。
- OpenAI SDK 兼容写法使用 `base_url="https://api.x.ai/v1"`。
- 响应默认可返回临时 URL；系统需要及时下载并落到 workspace，本项目现有 OpenAI 分支已经支持 URL 下载。
- xAI 官方 Image Editing 文档明确：OpenAI SDK 的 multipart `images.edit()` 不适用于 xAI 图片编辑，xAI 要求 `application/json`，参考图可传 data URI。

## 技术决策

- Grok 作为第三个图片 provider 类型：`grok`。
- Grok 独立保存配置，不复用 OpenAI 图片 provider，避免中转密钥/模型混淆。
- Grok 文生图复用 OpenAI 兼容响应处理，但请求体按 xAI 字段发送 `aspect_ratio` 和 `resolution`；Grok 图生图使用 JSON `/images/edits`，不走 OpenAI multipart。
- provider 元数据记录为 `grok_image`。
- 串行队列不改，因为现有候选图与角色图已经是串行执行。

## 风险

- 用户的中转服务若不是完全 OpenAI 兼容，可能需要后续适配字段。
- 真实 Grok 中转需要用户填入实际 Base URL/API Key 后试生成；本次未使用真实密钥发起外部出图。
