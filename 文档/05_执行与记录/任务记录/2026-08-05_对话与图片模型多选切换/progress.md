# progress

## 2026-08-05 会话

### S0 现状确认（已完成）

- 通读 `文档/README.md`、`文档/00_索引/AI上下文入口.md`、写作规范、OpenCode 运行时移植方案。
- 代码核对：对话模型契约已支持逐消息 model；`selectedDialogueModel` 只在启动取一次默认；设置页 AI 密钥单一槽位；图片生成 4 固定槽位 + active 切换。
- 与用户确认设计：设置页新增「模型管理」tab；对话/图片两个区块分开管理；字段=名称/providerId/modelId/BaseURL(可选)/APIKey(可选)；禁止删除当前选中；预置 6 个模型。
- 产出：`文档/04_方案与决策/2026-08-05_模型管理功能设计方案.md`（用户已确认）。

### S1 模型管理实现（已完成）

改动文件：

| 文件 | 改动 |
| --- | --- |
| `packages/shared/src/dto.ts` | 新增 `ManagedModelKind`/`ManagedModelItem`/`CreateManagedModelRequest`/`UpdateManagedModelRequest`；`AppSettings.models` |
| `apps/server/src/settings/settings.service.ts` | 存储结构 v2：`StoredManagedModel[]` + active 指针；预置 6 项；CRUD 4 方法；v1 文件升级写回；DB 模式映射 providerConfig 行 + 固定槽位 owner/删除限制 |
| `apps/server/src/settings/settings.controller.ts` | POST/PATCH/DELETE models + PUT activate |
| `apps/web/src/services/api.ts` | 4 个 API 方法 |
| `apps/web/src/stores/settings-store.ts` | 4 个 actions + notice scope `models` |
| `apps/web/src/components/settings/AppSettingsView.vue` | 新 tab「模型管理」+ 两个区块 UI + 添加表单 |
| `apps/server/src/settings/settings.service.spec.ts` | D2-A2 新增 8 个测试（M-01~M-08） |

关键发现（详见 findings.md）：

- G1 migration trigger `trg_credential_metadata_provider_owner_insert` 只允许 text→`opencode`、image→`image_secret_store`/`environment` 的 owner 组合；凭证轮换/清除/删除有 Outbox/不可变约束 → DB 模式下本期不支持模型凭证（报 `MANAGED_MODEL_SECRET_UNSUPPORTED_IN_DB`），文件模式完整支持（SecretStore）。
- DB 模式下模型 id 稳定为 `model_<providerId>`（providerConfig 行按 providerId 唯一）；文件模式用 uuid。
- DB 模式下固定槽位（AI 密钥/图片生成 4 槽）对应的模型行不可在模型管理删除（`MANAGED_MODEL_FIXED_SLOT_DELETE_FORBIDDEN`）；active 指针在 DB 模式不持久化（重启回默认预置）。

### 验证

| 项 | 命令 | 结果 |
| --- | --- | --- |
| shared 构建 | `pnpm --filter @airoaming/shared build` | 通过 |
| 三包 typecheck | `pnpm -w typecheck` | 通过 |
| settings 单测 | `pnpm --filter @airoaming/server test -- --run settings.service.spec` | 24/24 |
| 全量测试 | `pnpm test`（第二次跑） | shared 285/285；server 792/792（首次跑有 7 个并行资源竞争失败，单独复跑全过，与改动无关） |
| 真实 API | 起 server 后 curl：GET settings models=6；activate/add/delete/update 均正确；删 active、非法 kind 返回 400 | 通过 |
| 前端 UI | Playwright 打开设置页：模型管理 tab、两个区块、6 项模型、首项 is-active | 通过；截图 `/var/folders/.../opencode/settings-models.png` |

真实环境清理：验证期间添加的测试模型已删除，active 已恢复 GPT 对话/OpenAI 图片，DeepSeek id 恢复 `model_deepseek`。

### Handoff

- S2 对话运行时衔接已实施（2026-08-05 当轮）：运行时默认对话模型跟随模型管理选中（activeTextModelId）；对话面板新增模型选择器；消息气泡显示所用模型。
- 图片生成运行时接入（activeImageModelId）未实施（S3，用户未确认）。
- 残留风险：DB 模式下模型凭证不可用、固定槽位模型不可删、DB active 不持久化 —— 均为已记录的已知限制。

## 2026-08-05 会话（S2 对话运行时衔接）

### 改动

| 文件 | 改动 |
| --- | --- |
| `apps/server/src/settings/settings.service.ts` | `getRuntimeAIKeySettings()` 跟随 activeTextModelId（模型凭证优先、同 provider 复用 aiKey 凭证）；模型凭证内存缓存 + prepareRuntimeSecrets 预加载（文件模式）；保存 aiKey 时 `syncActiveTextModelWithAIKey` 同步选中/镜像；v1 升级镜像（aiKey 有凭证时） |
| `apps/web/src/stores/workbench-store.ts` | 新增 `selectDialogueModel` action（activate 持久化 + 更新 selectedDialogueModel） |
| `apps/web/src/components/workbench/ProjectDialoguePanel.vue` | header 模型选择器（列表=模型管理 text 模型、active 高亮、无密钥标记）；消息气泡模型标签 |
| `apps/web/src/components/workbench/ProjectWorkbenchView.vue` | 透传 dialogueModels / selectDialogueModel 事件 |
| `apps/web/src/components/layout/AppShell.vue` | 预加载 settings；传模型列表；处理切换事件 |
| `apps/server/src/settings/settings.service.spec.ts` | M-09 运行时跟随、M-10 v1 升级镜像 |

### 验证

- settings 单测 26/26；全量 pnpm test shared 285 + server 795 全绿；三包 typecheck 通过。
- 真实 API：默认模型跟随 activeTextModelId（xai/grok-4.5）；activate Kimi → defaultModel=kimi/kimi-k2；切回 xai 恢复。
- 前端 Playwright：对话面板选择器显示当前模型（xAI Grok 对话）、4 个 text 模型、点击 Kimi 后标签更新；截图 `dialogue-switcher.png`。
- 真实环境修正：S1 升级留下的中间态（activeTextModelId=model_gpt 与 aiKey=xai 不一致）手动镜像 model_xai 并选中，默认对话行为保持；验证后选中已恢复。

### 遗留

- 对话发消息时 OpenCode managed provider 切换（provider 带 baseUrl）会重启 serve，首次切换有数秒延迟（既有行为）。
- 无凭证模型切换后调用可能失败，选择器有"无密钥"标记，错误信息透传。

## 2026-08-05 会话（S3 图片生成运行时衔接）

### 改动

| 文件 | 改动 |
| --- | --- |
| `apps/server/src/settings/settings.service.ts` | `getRuntimeImageProviderSettings()` 跟随 activeImageModelId：type 按 providerId 推断（doubao/grok/runware 关键字，默认 openai）；凭证解析=模型 SecretStore → 同 providerId 固定槽位复用；「图片生成」tab 切换 activeImageProvider 时 `syncActiveImageModelWithProvider` 同步选中/镜像/字段 |
| `apps/web/src/components/workbench/ImageCandidatesWorkspace.vue` | 工具栏图片模型快捷切换（列表=模型管理 image 模型、active 高亮、无密钥标记） |
| `apps/server/src/settings/settings.service.spec.ts` | M-11 图片运行时跟随 |

### 验证

- settings 单测 27/27；全量 pnpm test shared 285 + server 796 全绿；三包 typecheck 通过。
- 真实环境修正：activeImageProvider=grok 但 activeImageModelId=model_openai_image 的不一致，手动同步为 model_grok_image（含模型 baseUrl 同步为槽位中转地址，避免生成地址跳变）。
- 真实 API：settings 返回 active=Grok 图片生成；UI Playwright：候选图工具栏选择器显示当前模型、3 个 image 模型项、active 高亮、切换 Runware 生效、已恢复 Grok。

### 遗留

- 无凭证/无 baseUrl 的图片模型生成时报 IMAGE_PROVIDER_NOT_CONFIGURED（既有检查，选择器有"无密钥"标记）。
- DB 模式 active 指针不持久化（重启回默认 openai_image/grok 推断），图片选择在 DB 模式跨重启不保持。

## 2026-08-05 会话（缺陷修复：DB 模式切换 500）

- 用户报告模型管理切换报错。根因：text 模型行写 credential_metadata 违反 G1 CHECK `ck_credential_metadata_text_owner_shape`（configured=0 时 fingerprint 必须 NULL；用户 DB 的 self 行有历史 fingerprint）。
- 修复：`writeDatabaseSettings` models 循环 text 行语义对齐（secretRef 恒 null、configured 跟随 fingerprint）。
- 回归测试：M-08 追加历史 text 行场景；settings 27/27、全量 shared 285 + server 796 全绿。
- 用户服务已重启（旧进程 66273 → 新 tsx watch），真实 API 全部模型 activate 验证通过；选中恢复 xai/grok。

## 2026-08-05 会话（缺陷修复：文稿库加载失败）

- 现象：/api/documents 500。根因：我 nohup 起的无 DB env 的 tsx watch 残留占住 4310，用户 watch 抢不到端口；无 env 进程非 DB 模式，documents assertDatabaseMode 抛错。
- 处理：杀残留进程树（68297/72168），touch main.ts 触发用户 watch（66261）重启子进程接管 → documents API 恢复。
- 附带修复：DB 模式 active 指针与 aiKey/activeImageProvider 对齐（原硬编码 gpt/openai_image）；deepseek 行污染修正（sqlite，走 trigger 允许语义）。
- 验证：documents/settings API 正常；settings 27/27、全量 796 全绿。

## 2026-08-05 会话（模型管理 UI 改造：添加弹窗）

- 用户反馈：模型管理样式需要改，添加模型用弹窗。
- 新增 `apps/web/src/components/settings/AddModelModal.vue`：对齐 CreateProjectModal 标准弹窗（Teleport 遮罩/圆角卡片/标题栏/类型 tab/双列表单/密钥显隐/ESC 与遮罩关闭/自动聚焦）。
- AppSettingsView：移除内联展开表单，两个区块"添加"按钮改为打开弹窗；列表卡片升级（圆角 12、渐变背景、选中左侧高亮条、hover 抬升、radio 圆形选中态、mono 字体模型标识）。
- 验证：web typecheck 通过；Playwright——弹窗打开/标题/类型 tab 切换/ESC 关闭/填表提交自动关闭/列表 7→8→删除恢复 7；截图 add-model-modal.png。

## 2026-08-05 会话（Base URL 改为必填）

- 用户反馈：添加模型时 Base URL 必填。
- 前端：AddModelModal 标签加 *、input required、canSubmit 校验 baseUrl；提交不再传 null。
- 后端：createManagedModelInner 缺 baseUrl 抛 `MANAGED_MODEL_BASE_URL_REQUIRED`；shared DTO baseUrl 改必填 string。
- 测试：M-03 新增缺 baseUrl 断言；M-06/07/08/09 创建用例补 baseUrl；settings 27/27、全量 796 全绿。
- UI 验证：标签带 *、缺 baseUrl 提交禁用、填后可用。

## 2026-08-05 会话（列表"已配置"显示修正）

- 现象：AI 密钥 configured=true，但模型管理列表中该对话模型显示"未配置"。
- 根因：toPublicManagedModel 只按 secretRef 判断；对话模型凭证是 OpenCode-owned（fingerprint 存在、secretRef 恒 null），DB 模式 text 行 secretRef 必为 null → 永远显示未配置。
- 修复：configured = Boolean(secretRef || keyFingerprint)；syncActiveTextModelWithAIKey 镜像/复用模型时同步 aiKey.keyFingerprint；v1 升级镜像同样带 fingerprint。
- 验证：settings 27/27；真实环境 self 模型 configured=True，DeepSeek/xai（无凭证）正确显示 False。

## 2026-08-05 会话（对话配置恢复为 xai/grok-4.5）

- 用户确认：配置的对话模型是 xai/grok-4.5（sub.lydcloud.uk 中转），但 DB preference.defaultTextProviderId 指向 self 行（OpenCode Go），xai 行 metadata unconfigured。
- 恢复（sqlite，走 G1 trigger 允许语义）：
  1. xai 行 metadata → configured=1 + fingerprint=sha256:0846...（与 grok_image 中转 key 相同，运行时经 findMatchingImageCredentialForTextRuntime 从 SecretStore 恢复同一 key）。
  2. preference.defaultTextProviderId → xai 行。
- 验证：aiKey=xai/grok-4.5 configured=True；模型列表 xAI Grok 对话 configured=True+active；运行时 defaultModel=xai/grok-4.5；图片选中保持 Grok。
- 说明：xai 与 grok_image 用同一中转 key（指纹一致），文本运行时凭证可复用图片 SecretStore 条目，无需重输 key。
