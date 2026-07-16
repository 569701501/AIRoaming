---
doc_id: AIR-TASK-20260716-SCRIPT-REAL-MODEL-FIX-PROGRESS
status: completed
created: 2026-07-16
updated: 2026-07-16
owner: AI漫游项目
audience: human, ai-agent, developer, qa
source: 本次修复执行过程与验证结果
---

# 双流程真实模型验收修复进度

## 2026-07-16

1. 先建立失败回归：页面输入生成后不刷新立即采用；B2 Prompt 必须展示 `excludedRanges[].sourceRange`。
2. 修复 Web DB-only 工具结果：生成/修订后统一刷新项目运行态。
3. 修复 B2 Prompt/Skill：明确单数 `sourceRange`、category 闭集和空数组规则。
4. 真实导入复验发现验证器误判合理氛围归纳；先加失败 Prompt 回归，再明确结构化归纳与具体新增剧情的边界。
5. 真实导入复验发现 materialize 把磁带标签文字放入对白；先加失败 Prompt 回归，再明确非口头文本必须保持载体。
6. 通过页面结果卡只重试失败章；第一章和第二章均形成正式 import 版本。
7. 更新架构契约、完成记录、会话记录和长期记忆。
8. Scrutiny Review 发现 B2 category 示例使用拼接枚举字符串；先建立失败断言，再改为合法示例值和独立枚举闭集规则。

## 修改文件

- Web Store、Server Prompt 与测试、`script-import-normalize` Skill、AI 显式生成 E2E。
- 双流程来源状态契约、会话记忆、长期记忆和功能完成记录。

## 验证

- 真实浏览器：AI pending 立即采用通过；完整剧本两章逐章确认通过。
- `pnpm typecheck`、`pnpm typecheck:e2e`、`pnpm build` 通过。
- `pnpm test:e2e:prepare` 通过。
- DB-only Playwright 完整矩阵 11/11 通过。
- Shared 153/153；Server 全量首次 641/643，两个无关备份用例并行超时，隔离复跑 2/2 通过。
- 5 个正式 Skill 的 `quick_validate.py` 全部通过；`git diff --check` 通过。

## Handoff

任务已完成，无待实现阶段。后续只需按真实失败样例迭代 Prompt 反例；不要放宽具体剧情、对白、实体和来源硬门，也不要扩张现有 A+ 用户流程。
