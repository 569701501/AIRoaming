---
doc_id: AIR-TASK-20260712-G3-CORE-IMPLEMENTATION-PLAN
status: completed
created: 2026-07-12
updated: 2026-07-12
owner: AI漫游项目
audience: human, ai-agent, developer, qa
source: G3 五份施工资料与用户执行 G3 要求
---

# G3-core 代码实现计划

## 目标

在当前基线 `96c8845` 上按施工资料实现 G3-core：

- Shared canonical `vertical_scroll/paged_comic` 与 DTO 收口。
- 固定 `0010_g3_comic_format_immutable`、G3 overlay、0001～0010 runtime ledger。
- Create/PATCH raw body 保护、DB strict repository、file 只读兼容与 audit。
- 现有创建弹窗、只读展示和 G2 SourceSnapshot/Candidate/Task/Layout 下游适配。
- 用临时 SQLite、临时 workspace、fake provider 完成自动证据。

## 非目标

- 不实现 G3-M maintenance importer、MigrationIssue 决议 runner、备份恢复、final import、DB-only activate。
- 不实现 G5 PageProfile/LayoutPreset/正式多格布局。
- 不改真实 workspace、真实数据库、真实 key 或真实 provider。
- 不新增 reviewer/attestation/sealed bundle/CAS 流程。

## 阶段

1. A0：Shared canonical、DTO、受影响 exhaustive 分支和 unit/typecheck。
2. A1：0010 migration、overlay inspection、G3 runtime ledger、Prisma startup guard。
3. B0：Create/Update raw parser、稳定错误 envelope、PATCH mode gate。
4. B1：DB strict repository、trigger error、事务和 direct SQL 证据。
5. B2：file tagged reader、provenance serializer、fail-closed、只读 audit。
6. C0/C1：Web API error、Pinia create state、modal、只读标签。
7. D0：SourceSnapshot、Candidate/Prompt V2、persistent image input、legacy layout adapter。
8. E0：自动化、重启/故障、证据包、Scrutiny Review；Runtime/User Review 由临时环境执行并留痕。

## 强制验收

- 每个阶段只修改施工包允许的文件，阶段结束更新 `progress.md`。
- 发现文档与代码事实冲突，先写入 `findings.md` 并停在当前切片。
- 新 runtime/API/DB/artifact 无旧 alias；file alias 只在明确输入边界出现。
- Candidate/Prompt V2 保存 `sizePolicyVersion=legacy_generation_default_v1` 与 width/height；G2 source projection 的 `policyVersion` 不变。
- G3-core 完成只能标记 `G3-core completed`；G3-M 未完成前不能标记 production-ready。

## 退出标准

- A0～E0 全部完成并有命令、退出码和证据。
- Scrutiny Review 通过，残留风险已列出。
- Runtime/User Review 在临时环境完成；真实 workspace 发布门单独记录。
- 新增功能完成记录并同步 `文档/02_架构与契约/`、`文档/03_模块梳理/`、`文档/06_测试与验收/`。
