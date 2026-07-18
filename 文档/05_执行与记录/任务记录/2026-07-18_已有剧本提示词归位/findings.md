---
doc_id: AIR-TASK-IMPORT-PROMPT-002
status: completed
created: 2026-07-18
updated: 2026-07-18
owner: AI漫游项目
audience: human, ai-agent
source: 代码库探索
---

# 探索发现

## B2 真实运行链

- `ScriptImportAnalysisService` 对短稿单次分析；长稿按连续稳定 block 生成叶子分析，再逐层合并相邻结果。
- 每次模型输出由 Shared `import-analysis/1.0` 严格解析，并要求全部 block 完整、唯一分配。
- 首次格式或契约失败只允许一次修复；最终合并连续失败时明确失败，不回退成技术分片目录。

## B4 真实运行链

- 用户整体确认拆章目录后，系统一次创建全部章节入口；后台逐章领取和处理。
- 章节整理只读取该目录项已确认的完整原稿 blocks，输出固定章节 Markdown，再由 Shared 严格解析和规范化序列化。
- 整理成功后进入独立忠实度验证；验证通过 `sourceCoverage`、硬问题数组和输出行引用审计，不能继续修改正文。
- 单章失败被记录在当前阶段，不阻断其他章节；通过验证的章节进入只读待确认状态。

## 资产边界

- Skill 应负责来源分析角色、章节边界方法、忠实整理规则、忠实度审计语义和格式修复指令。
- Shared 应继续负责 `import-analysis/1.0`、章节 Markdown 和 `import-fidelity/1.0` 的严格 Schema 与解析。
- Server 应继续负责来源 block 装配、长稿层级、动态引用示例、输出行引用、重试上限、批处理状态、失败隔离与正式版本围栏。

## 最终实现结论

- B2、B4 整理、B4 验证分别读取 `import-analysis-prompt.md`、`import-materialize-prompt.md` 和 `import-verify-prompt.md`，没有合并模型阶段。
- 三阶段失败都读取同一只修结构的 `repair-validation-failure.md`，但仍由各自 Service 独立限制为最多一次。
- TypeScript 只保留动态 Schema 示例、来源事实和输出行引用，不再保存同义的来源分析、忠实整理或审计正文。
- 来源卫生测试阻止三类稳定 Prompt 与修复指令回流生产 TypeScript，并验证分析与批处理服务继续调用真实 Skill 编译入口。
- 本轮没有修改导入服务、Repository、页面或数据契约，因此 B1～B5 的确认门和状态机保持原样。
