# Grok 生图设置进度

---
doc_id: AIR-TASK-20260709-GROK-IMAGE-PROVIDER-PROGRESS
status: completed
created: 2026-07-09
updated: 2026-07-09
owner: AI漫游项目
audience: human, ai-agent
source: 本次任务执行记录
---

## 2026-07-09

### 已采取操作

- 使用 `$deep-think`。
- 读取长期记忆、项目文档入口、AI 上下文入口和写作规范。
- 探索现有设置、图片 provider、候选图队列、角色参考图队列实现。
- 联网核验 xAI / Grok Imagine 图片生成官方 API 行为。
- 建立任务记录目录。
- 扩展共享 DTO：图片 provider 类型增加 `grok`，AppSettings 增加 `grokImageProvider`。
- 后端设置服务新增 Grok 图片 provider 持久化、环境变量默认值和运行时读取。
- 图片 provider 网关新增 Grok 文生图 `/images/generations` 与图生图 `/images/edits` JSON 请求分支。
- 前端设置页“图片生成”新增 Grok 下拉项和独立配置表单。
- 候选图、角色参考图、场景参考图 metadata 支持 `grok_image`，串行队列保持不变。
- 更新生成任务协议和核心数据模型文档。

### 创建或修改文件

- `packages/shared/src/dto.ts`
- `apps/server/src/settings/settings.service.ts`
- `apps/server/src/projects/image-provider.service.ts`
- `apps/server/src/projects/image-candidate.service.ts`
- `apps/server/src/projects/character-reference.service.ts`
- `apps/web/src/stores/settings-store.ts`
- `apps/web/src/components/settings/AppSettingsView.vue`
- `文档/02_架构与契约/生成任务协议.md`
- `文档/02_架构与契约/核心数据模型.md`
- `文档/会话/2026-07-09-21-06-Grok生图设置.md`
- `文档/05_执行与记录/任务记录/2026-07-09_Grok生图设置/task_plan.md`
- `文档/05_执行与记录/任务记录/2026-07-09_Grok生图设置/findings.md`
- `文档/05_执行与记录/任务记录/2026-07-09_Grok生图设置/progress.md`
- `文档/05_执行与记录/功能完成记录/2026-07-09_Grok生图设置.md`

### 验证

- `corepack pnpm --filter @airoaming/shared build && corepack pnpm -r typecheck`：通过。
- `corepack pnpm -r --parallel --filter @airoaming/shared --filter @airoaming/server test`：通过，5 个测试文件、48 个 server 测试和 15 个 shared 测试通过。
- 首次运行 `corepack pnpm typecheck` 时被 PATH 上 pnpm 11 的 approve-builds 机制拦截，未进入代码检查；改用项目声明的 corepack pnpm 9 直接执行 workspace 命令后通过。

### Handoff

已完成代码与文档更新。真实运行时需要用户在设置页选择 `Grok 图片生成`，填写 Grok 中转 Base URL、模型和 API Key 后，用项目候选图或参考图实际出图验收。

### 真实中转测试

- 读取 `workspace/settings/app-settings.json` 的非敏感字段确认：`activeImageProvider = grok`，`grokImageProvider` 已配置，Base URL 为用户中转地址，API Key 已保存。
- 直接请求该中转 `/images/generations`，模型 `grok-imagine-image-quality` 返回 400：`images endpoint requires an image model, got "grok-imagine-image-quality"`。
- 请求同中转 `/models`，当前只暴露 `gpt-image-1`、`gpt-image-1.5`、`gpt-image-2` 三个图片相关模型，没有 Grok/Imagine 模型。
- 追加测试 `grok-imagine-image` 也返回同类 400。
- 结论：代码和设置读取链路可用，但当前中转服务未提供 Grok 图片模型映射，真实 Grok 出图未通过。需要用户修正中转模型映射或提供实际 Grok 图片模型 ID / 路由后再测。

### 真实中转复测成功

- 用户修正中转配置后再次测试：`/models` 已能看到 Grok/Imagine 相关模型。
- 使用设置中的 `modelId = grok-imagine-image-quality` 调用 `/images/generations`，参数包含 `response_format=b64_json`、`aspect_ratio=1:1`、`resolution=2k`。
- 结果：HTTP 200，耗时约 9.5 秒，返回 `b64_json`，保存图片到 `workspace/grok-test/grok-generation-grok-imagine-image-quality-2026-07-09T13-31-29-376Z.png`。
- 人工打开图片确认：测试图正常显示，Grok 文生图链路已通。
