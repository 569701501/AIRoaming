---
doc_id: AIR-TASK-20260718-PROMPT-RESIDUE-FIX-PLAN
status: completed
created: 2026-07-18
updated: 2026-07-18
owner: AI漫游项目
audience: human, ai-agent, developer
source: 后端 Prompt 残留复核结论
---

# Prompt 残留修复计划

## 目标

修复复核发现的 4 类生产 Prompt 残留，落实 ADR-0017 的 Skill 单一事实源边界。

## 范围

1. 持久任务 `shot_generate` 复用完整分镜 Skill Prompt、对白来源、引用映射和固定质量门。
2. 图片 provider 的参考图职责迁入 `image-candidate-generate`。
3. 分镜 JSON 示例迁入 `storyboard-shot-generate`。
4. 参考图画风和漫画格式 Prompt 词汇迁入 `image-reference-generate`。
5. 增加源代码防回流检查。

## 非目标

- 不迁移 P6 离线 evaluator Prompt。
- 不迁移剧本、导入和剧情结构历史 Prompt。
- 不改页面字段、用户确认流程、数据库 Schema 或任务协议。
- 不调用任何付费图片服务。

## 阶段与退出标准

| 阶段 | 退出标准 |
| --- | --- |
| S1 Skill 资产补齐 | 三个 Skill 的新增 reference 通过校验，稳定创作词不再需要代码副本 |
| S2 运行时接线 | 四类生产路径全部从 Skill 读取；缺失时 fail-closed |
| S3 防回流 | 自动测试能阻止已迁移词句重新出现在指定生产源码 |
| S4 验证与留痕 | 类型检查、构建、相关测试通过；文档和长期记忆更新 |

## 验收标准

- 指定后端/Shared 生产源码不再含复核列出的稳定创作正文。
- `shot_generate` 不再存在第二套简化分镜方法。
- OpenAI、豆包、Grok 的参考图职责由 Skill Profile 编译。
- 页面和 API 契约无变化。
- 全程只做离线测试。
