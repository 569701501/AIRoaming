---
doc_id: AIR-TASK-20260718-PROMPT-RESIDUE-PLAN
status: completed
created: 2026-07-18
updated: 2026-07-18
owner: AI漫游项目
audience: human, ai-agent, developer
source: 用户要求再次检查后端 Prompt 残留
---

# 后端 Prompt 残留复核计划

## 目标

确认分镜、角色/场景参考图和候选图稳定创作提示词是否仍在 `apps/server/src` 或其他后端运行资产中保留第二份可编辑事实源。

## 非目标

- 不修改页面、数据库、用户流程或生成协议。
- 不调用真实模型或图片 provider。
- 不把格式校验、错误提示、动态事实标签和传输参数误判为创作 Prompt。
- Scrutiny Review 阶段只读；发现问题后再决定是否进入修复阶段。

## 验收标准

1. 覆盖生产源码、Skill 资产、测试、配置、编译输出边界和实际调用链。
2. 每个命中按“稳定创作正文 / 合法动态装配 / 固定校验 / 测试断言 / 历史或文档”分类。
3. 检查是否存在 Skill 读取失败后的静默硬编码 fallback。
4. 给出通过/不通过结论、具体文件证据和残留风险。

## 阶段

1. [x] 建立 Skill 提示词特征与残留判定标准。
2. [x] 静态扫描生产源码、配置和测试。
3. [x] 沿分镜、参考图、候选图三条生产调用链复核。
4. [x] 执行离线验证并完成 Scrutiny Review。

## 退出标准

- [x] 扫描和调用链证据完整。
- [x] 静态复核结论为“不通过，需要修复”。
- [x] Runtime/User Review 不适用：本轮只读且未调用真实模型/provider。
- [x] 已更新本次会话、任务记录和上一任务的纠偏说明。
