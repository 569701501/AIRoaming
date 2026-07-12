---
doc_id: AIR-TASK-20260712-G3-CORE-IMPLEMENTATION-FINDINGS
status: active
created: 2026-07-12
updated: 2026-07-12
owner: AI漫游项目
audience: human, ai-agent, developer, qa
source: G3-core 当前代码探索与施工资料
---

# finding

## 当前基线

- 当前 commit：`96c8845`，分支：`codex/g0-test-safety-net`。
- G3 施工资料已完成并通过 docs-only Scrutiny Review；本轮已进入 G3-core 代码实现，G3-M 仍未实现。
- 默认 persistence 为 file；DB mode 显式启用，migration tree 已追加固定 0010，PrismaService 走完整 0001～0010 G3 guard。

## 待验证风险

- Shared enum 翻转会触发 Server/Web 多处旧值 exhaustive 分支，必须在 A0 原子修复或明确分段保持可编译。
- 当前 DB repository 存在 `paged_comic <-> page_horizontal` 转换，必须在 B1 严格移除；file adapter 不能复用该转换。
- 当前 SourceSnapshot builder 存在“非 vertical 即 paged”风险，必须在 D0 fail-closed。
- Candidate/Prompt 已升为 V2；历史 V1 输入只允许被识别为不可执行，不补推新尺寸。

## 冻结裁决

- G3-core/G3-M 分层、0010 exact SQL、file read compatibility、DB PATCH 边界、`sizePolicyVersion` 均以五份施工资料为准。
