---
doc_id: AIR-TASK-IMAGE-PROMPT-PRO-002
status: active
created: 2026-07-17
updated: 2026-07-17
owner: AI漫游项目
audience: human, ai-agent
source: task_plan.md
---

# 2026-07-17

- 已确认此前真实 A/B 使用的是当前旧 Prompt，只能作为旧版基线，执行顺序不符合本任务要求。
- 已检查角色参考图、场景参考图、候选图和 Provider Profile 的生产代码位置。
- 已启动官方资料与热门开源工作流的初步检索。
- 当前停在 R1：先向用户列出待调研、待重写和待测试的完整清单；不修改生产 Prompt，不调用图片服务。
- 已完成 R1：冻结角色参考、场景参考、五类漫画静态候选图、参考图职责和三个 Provider Profile 的改写范围；漫剧作为独立后续包。
- 已完成 R2：对照 OpenAI、Seedream、xAI、Midjourney 官方资料，以及 StoryDiffusion、ComfyUI、IP-Adapter、InstantID、AI Comic Factory 等公开工作流。
- 正式调研依据已写入 `文档/04_方案与决策/2026-07-17_图片Prompt专业化调研与V2设计依据.md`。
- R2 核心结论：不导入万能 Prompt，采用“语义规格 + 任务模块 + Provider 编译器”；Prompt、参考图编排和请求参数分别治理。
- 本阶段未修改生产 Prompt，未调用付费图片服务。下一阶段为 R3：编写 V2。
- 已完成 R3：生产默认参考图模板升级为 V2，同时保留显式 V1 构造路径供同语料 A/B。
- 候选图领域规格不新增页面字段，基于正式人物数量、`coreAction` 和 `comic.composition` 增加无人、单人、双人、多人、决定性瞬间和条件式特效因果合同。
- 新增三个独立 V2 Profile：`openai-comic-clean-plate-v2`、`doubao-seedream-comic-clean-plate-v2`、`grok-comic-clean-plate-v2`；旧 V1 直通 Profile 保留。
- Provider 网关按实际选中参考图追加角色身份/场景空间的保持项、允许变化项和忽略项；OpenAI/Grok 使用英文，Doubao 使用中文。
- 修复两个已由旧真实基线证明的参数问题：Doubao 三条请求均使用 `watermark=false`；候选图不再把 3:2 / 2:3 强制映射成 16:9 / 9:16。
- Grok 单参考图为保目标比例而降级纯文生图的问题没有伪装成已解决，继续保留显式 warning，进入 R4 风险复核。
- 正式 V2 模板与编译规则已写入 `文档/04_方案与决策/2026-07-17_图片Prompt专业V2模板与编译规则.md`，模块事实源已同步。
- 验证：图片 Prompt 定向测试 28/28；DB Prompt 冻结链与候选合同 40/40；Shared build、Server typecheck/build 通过；Server 全量单 worker 120 files / 720 tests 通过。
- 本阶段未调用任何真实或付费图片服务。下一阶段为 R4 独立静态复核。
- 已完成 R4 独立静态复核，结论为 `NOT_READY_FOR_PAID_AB`；本轮只读检查，未修改生产代码，未调用图片服务。
- 已通过：页面/Schema 边界、静态字段映射、五类镜头合同、15 份 Provider V2 差异、参考图职责、Doubao 水印与比例、DB Prompt 冻结链。
- R4 定向复跑：3 files / 14 tests 通过；15 份 V2 Prompt 长度 792～1698，固定语料全部编译成功。
- 硬阻断：`image-prompt-visual-ab.cli.ts` 仍按默认参数只编译 V1；现在执行付费命令会测错版本。
- 必须收口：OpenAI/Grok 动态镜头合同仍夹带中文前缀；Grok 单参考图会导致无人场景失去场景参考，A/B 评分必须隔离这一能力差异。
- 详细复核证据：`evidence/r4-static-review.md`。下一阶段为 R4.1 复核返工，R5 尚未放行。
- 已完成 R4.1：镜头合同改为版本化结构语义，OpenAI/Grok 编译英文合同，Doubao 编译中文合同，不再依赖中文前缀充当内部协议。
- 真实 A/B CLI 现在强制 `--prompt-version v1|v2`；不传版本会在 Provider 调用前失败。V1、V2 使用独立 schema v2 ledger、slot id、目录和 plan digest。
- 运行报告新增 15 条 Prompt manifest，记录 `profileId`、最终 Prompt SHA-256 和长度；V1/V2 两组摘要重合数为 0。
- Grok 单参考场景和群像三图上限的评测例外已固定到运行报告，Prompt 质量与参考能力分别评分。
- 双版本 dry-run 均成功：V1 30 槽、V2 30 槽、真实请求 0；完整付费测试上限为 60 次 Provider 请求。
- R4.1 定向 5 files / 23 tests；全量 120 files / 722 tests；Shared build、Server typecheck/build、diff check 全部通过。
- R4.1 证据：`evidence/r4.1-remediation-evidence.md`。当前状态为 `READY_FOR_USER_COST_AUTHORIZATION`，未获得明确授权前不执行 R5。
- 用户明确表示当前没有图片生成预算，要求不能继续生成图片。R5 因预算延期并禁止执行，双版本 ledger 保持 pending，真实请求继续为 0。
- 后续只允许做不调用图片 Provider 的离线收口；V2 可保留，但必须明确标记真实成图质量尚未验证，并保留 V1 回退路径。
- R6 离线收口完成：任务状态为 `OFFLINE_COMPLETE / VISUAL_QUALITY_NOT_RUN / PAID_AB_DEFERRED_BY_USER_BUDGET`。
- 新增功能完成记录 `文档/05_执行与记录/功能完成记录/2026-07-17_图片Prompt专业V2离线收口.md`，包含影响范围、数据边界、验证、风险、回退和 Handoff。
- 本任务结束时没有新增任何图片 Provider 请求；双版本 dry-run 继续保持 V1 0 次、V2 0 次。
