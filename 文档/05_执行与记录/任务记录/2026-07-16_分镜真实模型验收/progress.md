---
doc_id: AIR-TASK-20260716-STORYBOARD-S3-PROGRESS
status: completed
created: 2026-07-16
updated: 2026-07-16
owner: AI漫游项目
audience: human, ai-agent, developer, qa
source: task_plan.md
---

# 分镜真实模型验收进度

## 2026-07-16：S3-0 完成，S3-1 进行中

- 已读取 `$deep-think`、项目事实源、S1/S2 完成记录、剧情结构真实模型验收和当前 S3 契约。
- 用户已授权真实文本模型 S3；真实图片 provider 仍未授权。
- 工作树在本轮开始前为干净状态。
- 已创建全新隔离根、SQLite、workspace、data 与假密钥目录；迁移 17 项全部成功，数据库初始项目数为 0，`integrity_check=ok`。
- 隔离服务运行于 API `4332`、Web `5192`，默认文本模型经产品 API 确认为 `self/gpt-5.5`；持久图片任务 worker 已关闭。
- 已清理本项目前序浏览器测试遗留的 6 个孤立进程；未读取、修改或删除任何用户项目。
- 下一步创建 AI 创作来源项目，并按生产路径形成正式 ScriptVersion 与 StoryVersion。

## 2026-07-16：S3-1 完成

- 新建 AI 创作项目 `4c5e8a2b-759f-49cd-88cf-1086498b3137`，真实 `self/gpt-5.5` 生成两章项目大纲与第 1 章正文。
- 首次保存 AI 章节 pending 时稳定暴露 `G2_DATABASE_CONTRACT_VIOLATION`：项目级 `project_story` 线程被错误绑定到只接受章节级线程的 pending/revision 审计字段；数据库正确拒绝，正式正文与 pending 均未污染。
- 已用真实临时 SQLite 把该路径固化成回归测试；最小修复改为仅在 thread/project/chapter/message 完全同域时绑定审计 ID，项目级线程则保留正式大纲/章节卡来源绑定并以系统密封来源落库。红测稳定失败，修复后通过，原始页面/API 路径复测成功。
- AI 第 1 章正式 ScriptVersion 为 `0996d782-a5f5-42c2-a679-c463acc5d486`；真实剧情结构为 3 角色、6 场景、12 beats，正式 StoryVersion `ee2bdc0f-1377-4772-91d9-a1e05049f9d4` 精确绑定该 ScriptVersion。
- 用户页面明确点击“生成分镜”后，真实模型首次通过 S2 固定门，形成 24 镜 pending；12/12 beats 全覆盖，顺序、beat-scene、引用、双表达和 `promptDraft` 污染检查通过。
- 确认前章节仍为 `structured`、正式 StoryboardVersion 为空、出图准备禁用；用户点击“确认分镜”后正式 StoryboardVersion `76a1d0fd-ccdf-4808-a896-d719aec852df` 精确绑定 StoryVersion，章节进入 `storyboard_done`，出图准备入口解锁。
- 真实图片 provider 未调用；结构确认产生的 3 个角色图任务因 worker 关闭保持 `queued`。预检因缺角色定稿图为 `ready=false`，这是未授权图片阶段的预期阻断，不影响分镜阶段通过。
- 页面控制台 error/warn 为 0，SQLite `integrity_check=ok`。

## 2026-07-16：S3-2、S3-3 完成

- 新建导入项目 `9436e993-b2cd-4219-a57f-b1307207aba9`，上传带明确两章边界的完整剧本《零点灯塔》；真实模型提出 2 个章节候选且无阻断问题。
- 用户整体确认拆章目录一次后，后台依次整理和验证全部 2 章，最终均为 `pending_ready`；只确认第 1 章后形成 `origin=import` ScriptVersion `1e1bb4a9-e445-4206-9c6b-3112b07b4020`，第 2 章仍无正式 ScriptVersion 且保留 import pending。
- 导入第 1 章真实 StoryVersion `c889b0f4-60ba-4b03-a20b-4ab687f49484` 精确绑定上述 ScriptVersion，结构为 3 角色、3 场景、7 beats。
- 页面使用同一 `storyboard-shot-generate` 生成分镜。首次输出格式可读取，但命中固定门 `STORYBOARD_DIALOGUE_FRAME_EMPTY:shots[8]`；系统仅执行一次定向修复，修复后得到 12 镜，7/7 beats 全覆盖、引用和 `promptDraft` 边界通过。
- 确认前章节为 `structured`、current storyboard 为空、出图准备禁用；确认后 StoryboardVersion `6c229ede-200a-4c70-bacf-809c1b7ea371` 精确绑定 StoryVersion，章节 `storyboard_done`，出图准备入口解锁。
- AI 来源 OpenCode 分镜 session 为 1 次 user/assistant；导入来源为 2 次 user/assistant，证明只在固定门失败后执行唯一一次 repair，没有无界重试。
- 两个项目的分镜对话工具名均为 `generate_storyboard`，页面均展示技能 `storyboard-shot-generate`；服务端静态路径统一调用 `buildStoryboardPrompt → parse → assertStoryboardQuality → resolveStoryboardReferences`，不读取上游 origin 分流。
- 两个项目页面控制台 error/warn 均为 0；所有 6 个角色图任务保持 `queued`，未调用真实图片 provider；SQLite `integrity_check=ok`。

## 2026-07-16：S3-4 完成

- 真实剧情结构生成期间发现 OpenCode 文本会话继承了本机工具能力，并越权创建一份临时会话文档；已删除该临时文件，确认工作树没有残留。
- 最小安全修复同时覆盖新旧会话：创建文本会话时写入 deny-all permission；每次发送消息时再次写入 `tools={"*":false}`，使升级前已存在且会被复用的会话也被立即收紧。AI漫游业务工具仍由应用在调用模型前受控执行，不依赖 OpenCode 工具调用。
- 新增两项 OpenCode 权限回归、两项来源摘要回归，并扩充真实 SQLite 来源作用域回归；聚焦 3 files / 7 tests 全绿，Server typecheck 通过。
- Server 全量为 114 files / 681 tests；并发运行 679 项通过，2 个既有重型迁移/备份用例命中固定 5 秒超时，隔离重跑分别 1/1 通过，断言均未失败。
- 浏览器验收页已关闭，隔离 Server/Web 已停止，端口 `4332/5192` 无监听；未删除隔离数据库，以便当前完成记录中的 ID 与结论可继续追溯。
- Runtime/User Review=`passed_real_model`，Scrutiny Review=`passed`；S3 完成，下一步仅在用户单独授权真实图片 provider 后进入 S4。
