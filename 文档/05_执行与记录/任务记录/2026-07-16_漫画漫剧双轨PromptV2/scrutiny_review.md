---
doc_id: AIR-TASK-20260716-DUAL-STORYBOARD-PROMPT-V2-SCRUTINY
status: passed_with_runtime_followup
created: 2026-07-16
updated: 2026-07-16
owner: AI漫游项目
audience: human, ai-agent, developer
source: 最终代码 diff、Prompt 契约测试、正式方案与验证记录
---

# Scrutiny Review

## 结论

`passed_with_runtime_followup`

## 复核项

- 生产 Prompt 中已删除“motion 只能补充 comic”和“两轨必须描述同一瞬间”的旧主从规则。
- Prompt 依次组合共享事实、漫画规则、漫剧规则和双轨边界，顺序由自动化测试锁定。
- 漫画规则没有混入秒数或运镜；漫剧规则没有逐句复制漫画画格，并允许 `static / none`。
- 共享约束只覆盖可追溯正式事实，没有要求两条轨道文案、构图或节奏相同。
- 视觉资产措辞只要求遵守实际输入中的 `visualTraits` 与可选资产描述，没有暗示模型能看到未注入图片。
- 修复 Prompt 与首次生成语义一致，不会把漫剧时间过程强行修成一个静态瞬间。
- 现有质量门没有被放宽；新增测试证明不同媒介文案在同一剧情锚点下合法。
- 变更没有触及页面、Schema、数据库、API、正式枚举、版本或确认流程。
- 正式文档明确记录 M1 仍共用镜头骨架，没有夸大为漫画/漫剧两套独立序列。
- 旧 S3 真实模型样例没有被当作 V2 运行证明。

## 残留风险

- 真实模型可能仍把 motion 写成 comic 的轻微改写，需 V1/V2 A/B 验证 Prompt 的实际服从度。
- M1 共用镜头数量、景别与机位，可能限制漫剧独立拆镜；只有真实样例持续证明后才应升级 Schema。
- 镜头冗余、表演自然度和媒介节奏包含主观判断，不能只依赖确定性质量门。
- 全量 Server 中既有备份恢复测试仍可能超过固定 5 秒，虽与本改动无关且隔离重跑通过，仍是测试稳定性债。
