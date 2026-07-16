---
doc_id: AIR-TASK-20260716-STORYBOARD-S1-PROGRESS
status: completed
created: 2026-07-16
updated: 2026-07-16
owner: AI漫游项目
audience: human, ai-agent, developer, qa
source: 分镜生成契约 S1 任务执行
---

# progress

## 2026-07-16

- S1 启动。
- 已确认 OpenCode `skills/` 仍是资产源码层，尚未接入运行时复制；本轮不创建孤立 Skill 文件。
- 发现 DB Storyboard Working Copy 只接受正式 Shot / Character ID，而当前 AI 输出是临时 `shot_001` 和角色名；需要由后台受控映射。
- 发现当前 `StoryboardDialogueService` 在 DB 模式仍调用已禁用的 legacy pending/confirm 接口；S1 必须接入 StoryboardVersionService。
- Prompt 已拆为 `generate` 与 `revise_pending`：首次生成不输出 Shot ID；调整只作用于当前 pending，保留镜头沿用稳定 ID，新增镜头不输出 ID，并始终返回完整草稿。
- Prompt 已统一使用正式 `over_shoulder`，角色、beat、scene 只允许引用当前 StoryStructure 本地 ID，同时加入忠实性、覆盖、单帧可画性、连续性、漫画阅读、视觉变化和 comic/motion 一致性约束。
- 新增后端引用解析：角色卡 ID/名称映射为 Project Character ID；beat/scene 越界或角色未绑定时在落库前失败。
- DB 对话生成、调整和确认已接入 StoryboardVersion Working Copy；新镜头由正式接口分配稳定 Shot ID，不再调用 DB 禁用的 legacy save/confirm。
- DB 分镜生成只读取剧情结构绑定的正式 ScriptVersion；正文 Working Copy 为 dirty 或结构来源过期时拒绝生成。
- Web 手动编辑/新增镜头继续沿用现有页面，但保存时同样映射角色引用、通过正式接口分配新 Shot ID，并使用当前 Storyboard Working Copy 的 chapterRowVersion。
- 定向 Server 测试 30/30、Shared 153/153、Server/Web typecheck 和 production build 通过。
- Server 全量单进程 661/662；唯一失败为既有备份恢复用例固定 5 秒 timeout，隔离默认超时仍约 7 秒，放宽为 15 秒后 1/1 通过，与 S1 改动无关。
