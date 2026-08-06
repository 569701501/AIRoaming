# findings

## 需求理解

- 对话模型和图片生成模型都可能配置多个。
- 用户期望"选中哪个就使用哪个"，且可以在使用过程中随时切换（如对话从模型 a 换到模型 b）。
- 当前缺少对话模型切换功能：一开始选了 a 模型对话，想换 b 模型没有入口。

## 现状探索（2026-08-05 核对代码）

### 对话模型链路（已确认）

1. 契约层已支持逐消息指定模型：
   - `SendDialogueMessageRequest.model?: AIRuntimeModelSelection`（packages/shared/src/dto.ts:871）
   - `DialogueMessageItem.model` 每条消息记录所用模型（dto.ts:814）
   - `OpenCodeRuntimeService.sendMessage / streamMessage / generateStructured` 均接受 `model` 参数（apps/server/src/ai-runtime/opencode-runtime.service.ts）
2. 模型列表接口：`GET /api/ai-runtime/models` 返回 `defaultModel + items`（全部已注册模型，含 managed provider），ai-runtime.controller.ts。
3. 前端问题根因：
   - `workbench-store.selectedDialogueModel` 只在 `loadRuntimeModels()`（启动时）取一次 default 模型，之后无任何 UI 可改（workbench-store.ts:277-291）。
   - 发消息时 `model: this.selectedDialogueModel ?? undefined` 透传（workbench-store.ts:504、1449）。
   - 设置页改 AI 密钥（provider/model/baseUrl/key）不会更新该内存态；只有刷新页面重新加载才生效。→ "想换 b 模型没办法"。
   - 对话面板（ProjectDialoguePanel.vue）无任何模型显示或切换控件。
4. 设置页 AI 密钥 = 单一槽位（服务商下拉 6 项 + 一个模型输入框 + baseUrl + key），切换服务商只对 xai 自动预填模型/baseUrl（AppSettingsView.vue onTextProviderChange）。
5. 后端 getRuntimeProviderBinding：仅对与当前 aiKey 凭证（providerId+baseUrl）匹配的 provider 注册 managed provider；其他 providerId 直接使用 OpenCode 原生配置。模型列表只返回 OpenCode 已实际注册的模型（2026-05-25 方案 §8.3 已写明该口径，2026-07-18 已实现逻辑/运行时 providerId 分离）。

### 图片生成链路（已确认）

- 设置页已有 4 个 provider 槽位（openai/doubao/grok/runware），各自独立配置 baseUrl/key/model。
- `activeImageProvider` 全局切换（settings-store.switchImageProvider），生成时按 active 用对应配置。
- 已满足"多个图片模型，选中哪个用哪个"（设置页切换），但工作区生成界面无快捷切换；生成任务不支持按任务指定 provider。

### 关键耦合点

- OpenCode managed provider 只有"当前 aiKey 配置"一套凭证。跨 provider 对话切换依赖 OpenCode 原生配置中的 provider，或重新注册 managed provider（ensureConfiguredProvider 会在 signature 变化时重启 OpenCode serve，约数秒）。
- `updateAIKeySettings`：providerChanged 且未传 apiKey 时会自动清 key（settings.service.ts:305-306）——若实现"选择器切换即持久化"，跨 provider 切换会意外丢凭证，需要微调。

## 方案方向（待用户确认）

### 阶段 1（核心闭环）：对话面板模型快捷切换

- 对话面板 header 增加模型选择器：列出 `GET /api/ai-runtime/models` 的 items（按 provider 分组），当前项高亮。
- 选择后立即更新 `selectedDialogueModel`（下次消息生效），并同步持久化到设置 aiKey（providerId+modelId），刷新后一致。
- 后端微调：切换 provider 且未传 apiKey 时保留现有 key，不清除（显式"清除密钥"才清）。
- 消息气泡可显示当次所用模型（DialogueMessageItem.model 已有数据）。

### 阶段 2（可选）：多对话模型槽位 + 图片生成工作区快捷切换

- 数据模型扩展：对话模型多槽位（仿图片生成 activeTextProvider），设置页多卡片管理。
- 图片生成：候选图工作台加快捷切换。

## 风险

- 切 provider（带 baseUrl）会触发 OpenCode serve 重启，首次切换有数秒延迟。
- 未配置凭证的 provider 模型不可用，选择器需标识或给出错误提示。
- 数据库模式：providerConfig 表按 providerId upsert，多槽位需要新增字段/行，属 schema 变更，需评估迁移。


## 2026-08-05 缺陷修复：DB 模式 activate 500

### 现象

用户报告"模型管理 选中后切换报错"。复现：DB 模式下 activate 任意存在的模型 → 500 Internal server error。

### 根因

`writeDatabaseSettings` 的 models 循环写 credential_metadata 时，text 行 update 分支为
`configured=Boolean(secretRef)`（false）+ `fingerprint=model.keyFingerprint`（历史行有值），
违反 G1 CHECK 约束 `ck_credential_metadata_text_owner_shape`：
`(configured=0 AND fingerprint IS NULL AND secret_ref IS NULL) OR (configured=1 AND ... text 行 secret_ref 必须 NULL)`。
用户 DB 中 `self` 行是历史 aiKey 遗留（text + fingerprint 非空）→ 每次激活写回即 CHECK 失败。

### 修复

text 行（owner=opencode）凭证语义对齐既有固定槽位：
`status = (secretRef || keyFingerprint) ? configured : unconfigured`；
`secretRef` 恒 null；`configured = Boolean(secretRef || keyFingerprint)`。
满足 CHECK（text configured=1 时 secret_ref NULL；configured=0 时 fingerprint NULL）。

### 验证

- 真实 DB（~/.airoaming/data/db/airoaming.sqlite）诊断脚本：init/activate OK。
- 服务重启后真实 API：activate model_xai/model_deepseek/model_grok_image/model_runware_image 全部 success。
- 回归测试 M-08 追加历史 text 行场景；settings 27/27、全量 796 全绿。
- 用户环境选中已恢复：对话=xAI Grok 对话，图片=Grok 图片生成。

### 教训

DB 模式模型行与固定槽位共享 provider_configs/credential_metadata，写入必须遵守 G1 既有 CHECK/trigger
语义（text=opencode 无 secretRef；image=image_secret_store 有 secretRef），不能简单照搬文件模式结构。


## 2026-08-05 缺陷修复：文稿库加载失败（端口占用 + DB active 指针）

### 现象

用户报告"文稿库变成加载失败"：/api/documents 返回 500。

### 根因（两个独立问题）

1. **端口被无 DB 环境进程占用**：排查期间我 nohup 起的 `tsx watch src/main.ts`（无 AIROAMING_PERSISTENCE_MODE=db）残留占住 4310；用户的 watch（66261，带 db env）抢不到端口。无 env 的进程跑在非 DB 模式，documents 的 `assertDatabaseMode()` 抛错 → 500。处理：杀掉我的进程树（68297/72168），触发用户 watch 重启子进程接管。
2. **DB 模式 active 指针与真实配置不一致**：`readDatabaseSettings` 的 activeTextModelId 硬编码找 providerId="gpt"（DB 无此行）→ 落到第一个 text 行（xai），与 aiKey（self/OpenCode Go）不一致；activeImageModelId 硬编码 "openai_image" → 与 activeImageProvider（grok）不一致。修复：分别与 textProvider（preference.defaultTextProviderId 行）和 activeProviderId 对齐。

### 附带数据修复

- deepseek 行（用户 8-05 添加）被 10:34 的操作污染：modelId=grok-4.5、baseUrl=opencode.ai/zen/go/v1、fingerprint 变成 self 行的指纹。sqlite 修正为 deepseek-chat + baseUrl NULL + unconfigured（走 G1 trigger 允许的 UPDATE 语义）。
- 备份库（airoaming-pre-0020-2026-08-05）对比确认：defaultTextProviderId=self 是用户 DB 原始状态（OpenCode Go），xai 行 configured=0 原本如此，未改动。

### 验证

- documents API 恢复：返回"凡人修仙传"文稿。
- settings：text active=自定义 OpenAI 兼容(self/grok-4.5)与 aiKey 一致；image active=Grok 图片生成与 activeImageProvider 一致。
- settings 单测 27/27、全量 shared 285 + server 796 全绿。

### 教训

- 排查期间自起的服务必须带与用户一致的环境变量（DB-only 模式），且用完即杀，避免抢占用户服务端口。
- DB 模式 active 指针推导不能硬编码预置 providerId，必须与 preference/aiKey 对齐。
- 对用户 DB 的写入操作（诊断脚本 activate 等）会产生链式污染，操作前先备份相关行、操作后核对。
