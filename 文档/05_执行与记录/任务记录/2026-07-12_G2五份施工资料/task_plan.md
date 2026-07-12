---
doc_id: AIR-TASK-20260712-G2-CONSTRUCTION-PACK-PLAN
status: completed
created: 2026-07-12
updated: 2026-07-12
owner: AI漫游项目
audience: human, ai-agent, developer, qa
source: 用户要求完善 G2 五份施工资料
---

# G2 五份施工资料任务计划

## 目标

把已采纳 G2 方案补成可供开发模型按切片执行的施工包，消除依赖范围、数据库约束、工程 seam、API 重放语义和测试 harness 的关键自由解释空间。

## 非目标

- 不实现 G2 业务代码、Schema、migration、worker 或 importer。
- 不执行真实数据迁移、DB-only 切换或外部 provider 调用。
- 不新增自签 Reviewer、attestation、sealed bundle 或其他审查基础设施。

## 阶段

1. Orchestrator：核对 G1/G2 事实源、当前 Schema、任务协议、Repository 和测试脚本。
2. Worker A：编写依赖边界表。
3. Worker B：编写精确 G2 overlay manifest。
4. Worker C：编写文件/Repository/事务地图。
5. Worker D：编写 API/DTO/兼容/幂等契约。
6. Worker E：编写可运行测试、fixture、barrier 与证据计划。
7. Scrutiny Review：交叉检查五份资料与既有 G2/G1 契约一致性。
8. Runtime/User Review：本任务仅产出施工文档，无运行时用户路径；标记不适用，并把运行复核留给 G2 实施阶段。

## 验收标准

- 五份资料均有 frontmatter、目标/非目标、唯一规则、切片退出标准和禁止项。
- 数据库资料列出精确对象名、表、时机、条件、错误码、migration 顺序与直接合同测试；不以占位描述代替。
- API 资料覆盖 Script/Story/Storyboard/Preflight/production state/history/task guard 的 request、response、并发、幂等、错误和旧路径兼容。
- 文件地图明确新增/修改路径、依赖方向、事务所有权与禁止扩大现有巨型 Repository。
- 测试资料给出实际可新增的脚本名、fixture builder、barrier 协议、切片命令与证据路径。
- 原 G2 方案、文档索引和长期记忆能够定位到施工包。

## 退出标准

- 五份施工资料完成且交叉引用有效。
- `git diff --check` 和文档路径检查通过。
- Scrutiny Review 结论为通过，或明确列出阻塞项。
- `progress.md`、`findings.md`、`handoff.md` 和功能完成记录齐全。

## 完成判定

- [x] 五份施工资料完成并进入正式文档索引。
- [x] 依赖、DB 对象、文件事务、API 幂等和测试入口均已冻结。
- [x] `git diff --check`、对象计数和文档路径检查通过。
- [x] Scrutiny Review 通过。
- [x] Runtime/User Review 对纯文档施工包不适用，已明确留给实施切片。
