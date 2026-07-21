---
doc_id: AIR-TASK-20260721-FULLFLOW-FINDINGS
status: completed
created: 2026-07-21
updated: 2026-07-21
owner: AI漫游项目
audience: human, ai-agent, developer, qa
source: task_plan.md
---

# 探索发现

## 当前事实

- 正式数据与代码仓库分离，当前 UI/API 使用 DB-only SQLite 与受控 workspace。
- 项目删除是不可恢复的项目容器清理；用户已明确要求删除旧项目。删除前已解析唯一目标，未使用模糊名称或批量目录命令。
- 文档口径为项目库优先，创建弹窗只要求项目名称和必选漫画版式，成功后直接进入第 1 步剧本。
- 正式 G0～G5 验收要求 current Script/Story/Storyboard/Preflight/CandidateLock/LayoutPublication 来源一致；第 7 步素材包不阻塞当前签收。
- 已知接受风险：标准启动缺少通用 Outbox 调度，项目删除事件可能停在 pending；本轮先按真实页面观察用户可见删除和数据库状态，不擅自扩张修复。

## 待验证

- 页面删除后旧卡片、项目查询与 DB 状态是否一致。
- OpenCode Go 文本链路在新项目中是否可完成各阶段生成。
- 当前 Runware 图片 Provider 是否能在真实候选路径生成并正确登记来源。
- 排版出版是否在新鲜来源上生成可打开产物和匹配 manifest。

## F-01 项目删除含角色视觉时无法 purge

- 页面删除后项目卡片与 active API 立即消失，但删除前存在 4 个 `Character.previewVisualId` 的项目在 `purgeDeletedProject` 命中 `AIR_G1:trg_characters_current_visual_scope_update`。
- 根因：`requestProjectDelete` 只在 Project 仍 active 时解除了 Project current 指针，没有同样解除 Character 的 `previewVisualId/primaryVisualId`；进入 deleting 后，角色 scope trigger 会拒绝由视觉删除触发的反向指针更新。
- 已先扩展 `P8-OTB-01/DEL-00`：加入真实 ready Asset、CharacterVisual 和 `previewVisualId`，修复前稳定失败。
- 已在删除 intent 事务中、Project 进入 deleting 前原子清空两类角色视觉指针并递增行版本；同一用例修复后通过，且最终 Character/CharacterVisual/Asset 均为 0。
- 本次真实目标是在修复前进入 deleting；其文件事件已 processed、项目 workspace 已清理，但 DB purge 仍被旧指针阻断。已建立一致性备份 `/private/tmp/airoaming-pre-delete-repair-20260721-1721.sqlite`。直接临时拆 trigger 的恢复动作因风险边界未执行，需另行明确授权或正式迁移方案。

## F-02 已完成章节可重复发布相同版本

- 第一次“完成本章”后按钮仍保持可用；在正文未修改的情况下再次点击，ScriptVersion 数量从 1 增至 2。
- 前端仅用“正文非空”判断能否完成，没有读取正式 working copy 的 `clean/dirty` 状态；服务端更新相同 working copy 时仍递增行版本，随后 publish 只识别同一次旧行版本请求的重放，不识别“当前版本 + 当前行版本 + 相同摘要”的重复完成。
- 已新增真实 repository 回归：相同 working copy 更新不递增行版本，使用当前版本和当前行版本重复 publish 返回 `replayed: true`，历史仍只有 1 条。
- 服务端对完全相同的 working copy 执行无操作重放，并将当前 clean 版本的同摘要 publish 视为重放；前端逐层传递 `ScriptWorkingCopyDto`，仅在 dirty 或本地有修改时允许再次完成。
- 针对性测试与前后端类型检查通过；仍需在隔离浏览器重载后确认按钮确实禁用。

## F-03 重生成场景图后页面不能稳定选择最新 Asset

- DB WorkbenchAsset 投影原本只有业务 metadata，不公开数据库 `createdAt`；同一 scene 多次生成时前端无法可靠判断哪张是最新 ready 资产。
- 已在公共 metadata 中加入数据库创建时间；场景重生成保持旧 current 直到新图 ready，再原子切换 currentVisual。
- 迁移语义对照只比较业务 metadata，忽略新增的排序展示时间，避免把兼容字段误判为内容迁移差异。

## F-04 相同来源重复确认 preflight 会制造重复 Revision

- 用户在正式 Storyboard、角色和场景来源均未变化时再次确认，原实现仍会新增相同文档的 PreflightRevision。
- repository 现以 source storyboard、source digest、document digest 和 notes 识别精确重放，返回现有 Revision，不增加历史。
- 前端 stale 判断不再比较 DB 投影中恒为 null 的 `sourceStoryboardUpdatedAt`，改读 workflow 的正式 freshness。

## F-05 Runware 候选多参考路径不可用

- 旧 `runware:101@1` FLUX.1 Dev 路径在实际候选 Prompt 超过 3000 字符时返回 `invalidPositivePrompt`；临时压缩后，`runware:56@1` IP Adapter 又返回 `failedIpAdapterLoad`。
- 已迁到 `runware:400@1` FLUX.2 Dev 原生 `inputs.referenceImages`，正向 Prompt 上限提升，最多接收 4 张参考；参考计划同步限制为 4。
- Provider 400 现在只向上抛安全 code/parameter，完整 message/taskUUID 仅写服务日志；便于定位且不把第三方响应原样泄露给页面。
- 单镜 3 参考和剩余 10 镜真实批量生成均通过，21 个针对性单测通过。

## F-06 DB-only 素材包内容不完整且阶段提前完成

- 首个真实包 `pkg_2714fc95` 只有 `manifest.json`、layout 和 11 张 locked 图；缺 script、structure、storyboard、preflight、candidates、characters 和正式出版 PNG，与页面“将包含的内容”矛盾。
- 根因是 DB-only 迁移只实现了 sealed LayoutRevision 与 source bindings；旧文件路径的完整打包逻辑没有被等价迁到数据库正式版本。
- 新实现直接读取 current Script/Story/Storyboard/Preflight、sealed LayoutRevision、Candidate/Lock、Character，并查找匹配当前 layout/source-lock 的 ready `layout_publication`，复制其全部 artifacts；不回读 legacy chapter 文件。
- `asset_package` workflow 完成状态现在要求 current ExportRevision.kind 精确为 `asset_package`；只有 layout publication 时保持可打包。页面还能标识旧包为历史包。
- 新包 `pkg_1d287311` 的 manifest 有 25 个唯一路径，磁盘也有 25 个文件：1 根 manifest、6 个章节核心文件、11 张 locked、5 个出版追溯/图片文件、1 个出版 manifest 和 1 个角色索引。11 个 Candidate 均为 current-final，3 个角色中 2 个有 primary visual。

## 真实视觉质量观察

- 角色与场景参考的 Provider 调用和来源链可用，但中文漫画提示在当前 Runware 模型上的审美稳定性不足。
- 观察到画风偏日式、雨夜场景变白天、伪文字、空背景、人物身份漂移和额外人脸；这些不阻断流程，却会阻断面向用户的成片质量。
- 结论应区分：七阶段工程流程已通；视觉质量仍需专门的模型选择、提示词和人工筛选轮次，不能宣称达到发布标准。

## 最终复核结论

- 静态复核通过：DB-only 正式来源、幂等、source freshness、manifest 和历史语义均有自动化保护，没有恢复双写或 file fallback。
- 运行复核通过：Codex 隔离浏览器完成全链路和刷新/下载/手机预览，浏览器 console 无 error/warn。
- 已接受残留：旧项目的不可见 deleting 壳记录不绕过 trigger 修；通用 Outbox 调度按用户此前决定不修；Web 主 chunk 仍有 >500kB 构建警告。
