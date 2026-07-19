---
doc_id: AIR-TASK-20260719-PREFLIGHT-VISUAL-FRESHNESS-PLAN
status: completed
created: 2026-07-19
updated: 2026-07-19
owner: AI漫游项目
audience: human, ai-agent, developer, qa
source: 候选图工作台 P2003 真实故障、ADR-0013、ADR-0018
---

# 出图准备视觉失效门禁修复计划

## 目标

当当前角色视觉、场景视觉、素材可用状态或出图准备纳入摘要的视觉来源发生变化时，已确认 Preflight 必须派生为 stale；候选图任务必须在创建前以用户可读门禁拒绝，重新确认最新出图准备后恢复。

## 非目标

- 不修改七阶段流程和现有页面展示字段。
- 不让出图准备生成或修复角色图、场景图。
- 不新增数据库 migration，不原地改写已确认 PreflightRevision。
- 不调用真实图片 Provider，不生成新图片。

## 验收标准

1. 已确认 Preflight 后更换当前场景视觉，生产状态返回 `preflight.freshness=stale`，出图准备为 `needs_update`，候选图任务不可启动。
2. 已确认 Preflight 引用的 Asset 从 `ready` 变为 `missing` 时同样失效。
3. 候选图任务创建返回受控 409 与稳定 reason code，任务表不新增记录，不到达 Provider。
4. 基于当前视觉来源重新确认 Preflight 后，候选图任务可以入队。
5. 未出镜角色变化不误伤；Storyboard、Story freshness 不受纯视觉变化影响。
6. 定向测试、相关全量测试、类型检查与无付费真实页面复核通过。

## 阶段

| 阶段 | 角色 | 内容 | 退出标准 |
| --- | --- | --- | --- |
| P0 | Orchestrator | 读事实源、冻结失败链路和测试契约 | 计划、发现和进度三件套建立 |
| P1 | Worker | 先写 DB 集成失败回归 | 旧实现稳定失败且命中用户症状 |
| P2 | Worker | 实现 live Preflight source freshness 与 NewWorkGate | 回归转绿，错误为受控 409 |
| P3 | Worker | 核对前端 workflow/错误提示投影 | 页面显示需更新且不出现 Internal server error |
| P4 | Scrutiny Review | 只读复核代码、契约、测试和文档 | 给出通过/不通过与风险 |
| P5 | Runtime/User Review | 真实项目无付费路径复核 | 第 4/5 步状态、任务数和 Provider 安全证据成立 |

## 最终状态

- P0～P5 全部完成。
- 视觉来源变化由生产状态查询实时重建并分类，不修改确认版 Preflight。
- 候选图任务在落库前由同一 freshness 结论阻断；重新确认最新 Preflight 后恢复。
- 未新增页面字段、数据库 migration 或付费图片调用。

## 回滚

代码修改可按文件撤回；不会更改 Schema 或生产数据。历史 Preflight 保持不可变，只改变其派生 freshness 与新任务门禁。
