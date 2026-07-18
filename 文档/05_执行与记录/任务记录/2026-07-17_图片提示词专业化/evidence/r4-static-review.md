---
doc_id: AIR-TEST-IMAGE-PROMPT-PRO-002
status: active
created: 2026-07-17
updated: 2026-07-17
owner: AI漫游项目
audience: human, ai-agent
source: R3 代码、固定语料、生产调用链与测试结果的只读复核
---

# R4 图片 Prompt V2 独立静态复核

## 1. 复核结论

R4 复核活动已完成，结论为：

```text
NOT_READY_FOR_PAID_AB
```

V2 Prompt 的领域字段、五类镜头合同、三 Provider 差异、参考图职责和任务冻结链总体成立；但是当前真实图片 A/B 命令仍固定编译 V1。现在执行付费命令会测试旧 Prompt，而不是比较 V1 与 V2，因此不得进入 R5。

本轮是只读复核，只新增复核记录，没有修改生产代码，也没有调用图片服务。

## 2. 复核范围

- `candidate-generation-spec.ts`：领域字段、镜头合同、摘要和参考图清单。
- `image-prompt-profile.util.ts`：V1/V2 分流和三个 Provider Profile。
- `reference-prompt.util.ts`：角色预览、角色四视图和场景参考 V2。
- `image-provider.service.ts`：参考图预算、Reference Roles、比例和水印参数。
- `persistent-g2-task-create-guard.service.ts`、`persistent-task-worker.service.ts`：DB 任务实际投递 Prompt 冻结。
- `image-prompt-baseline.util.ts`、`image-prompt-visual-ab.cli.ts`：固定语料和真实 A/B 入口。
- 五类候选固定语料：无人、单人、双人、四人群像、光效事件。

## 3. 已通过项目

| 检查项 | 结论 | 证据 |
| --- | --- | --- |
| 页面和 Schema 边界 | 通过 | V2 复用 `sections + systemConstraints`，没有新增页面字段和数据库字段 |
| 静态/动态内容隔离 | 通过 | 候选图只读取 `panelDescription`、`coreAction`、`emotion`、`composition`、景别、机位、角色、场景和画风；不读取对白、旁白、`motion`、`promptDraft` |
| 五类镜头合同 | 通过 | 无人、单人、双人、多人、特效因果均有独立固定语料检查 |
| 三 Provider 最终文案差异 | 通过 | 5 个案例 × 3 Provider 共 15 份 Prompt，每个案例三份均不相同 |
| Prompt 长度 | 通过 | 15 份 V2 均为 500～5000 字符；本次实测范围 792～1698 |
| 参考资产合同 | 通过 | 角色身份种子、四视图身份锁、场景零人物合同均存在 |
| 参考图职责 | 通过 | 实际选择参考图后才追加角色身份/场景空间的保持、允许变化和忽略项 |
| Doubao 请求参数 | 通过 | 文生图、单图编辑、多图候选均 `watermark=false`，候选尺寸保持正式 3:2 / 2:3 |
| DB Prompt 冻结 | 通过 | 新 DB 任务保存 `providerType`、`providerProfileId` 和 `providerPrompt`，运行时 Provider 改变会阻断 |
| 回归测试 | 通过 | R4 定向复跑 3 files / 14 tests；R3 已完成全量 120 files / 720 tests |

## 4. 硬阻断

### B1：真实 A/B 命令只能生成 V1

证据：

- `image-prompt-baseline.util.ts` 中 `compileImagePromptBaseline()` 默认 `promptVersion="v1"`。
- `image-prompt-visual-ab.cli.ts` 直接调用 `compileImagePromptBaseline(suite)`，没有传版本，也没有 `--prompt-version` 参数。
- 当前 ledger、输出目录和请求预算也没有区分 V1/V2 运行。

影响：

- 现在执行 `image:prompt:visual-ab --execute` 会继续测试旧 `positivePrompt` 直通版本。
- 即使产出了新图片，也不能证明 V2 的效果，且会造成不必要付费。

放行条件：

1. A/B 入口显式接收 `v1` 或 `v2`，禁止隐式默认后直接付费执行。
2. V1、V2 分开 ledger、输出目录和 plan digest。
3. 运行报告记录 `promptVersion`、`profileId` 和最终 Prompt 摘要。
4. 先用 `--dry-run` 或等价方式证明两个版本的 Prompt digest 不同，再允许 `--execute`。

## 5. 必须在 R5 前收口的质量问题

### Q1：OpenAI/Grok Profile 仍直接夹带中文镜头合同

固定语料的 15 份 V2 中，每份都检测到三条中文动态合同。Doubao 使用中文是预期行为；OpenAI 和 Grok 的外壳、输出合同与参考图职责使用英文，但 `人物数量：`、`动作主客体：`、`特效因果：` 等内容未经过 Provider 语言编译。

这不等于模型一定无法理解，但会带来两个问题：

- Provider Profile 只完成了外壳差异，没有完整完成动态合同的语言适配。
- 当前测试反而要求三个 Provider 都包含中文前缀，容易把实现细节固化成错误契约。

建议修正：把镜头合同先表达为稳定的结构化语义，再由 OpenAI/Grok 编译为英文、Doubao 编译为中文；不要用中文字符串前缀充当长期内部协议。

### Q2：Grok 单参考图会被省略，固定语料中的无人场景因此失去场景参考

无人旧港案例只有一张场景参考图。当前 Grok 为保持目标比例，在单参考图时降级纯文生图，并输出：

```text
grok_single_reference_omitted_for_aspect_ratio
```

这不是 Prompt 文案缺陷，但会让 Grok 无人场景的“场景一致性”评分与 OpenAI、Doubao 不同条件，不能直接横向归因于 V1/V2 Prompt。

R5 必须选择并记录其中一种实验口径：

1. 将 Grok 该案例标记为参考能力例外，场景一致性不参与跨 Provider 总分；或
2. 增加一组所有 Provider 都不使用参考图的纯 Prompt 对照；或
3. 先解决 Grok 单参考图比例策略并单独验证。

禁止通过复制同一张图、添加空白图等未经验证的方式伪造多参考输入。

## 6. 非阻断但尚未闭环的问题

1. 角色预览、角色四视图和场景参考 V2 目前是共享英文模板，不像候选图一样按 Provider 编译。它们已比 V1 更专业，但“参考资产也按 Provider 适配”尚未完成。
2. `negativePrompt` 在 V2 中用于审计和非空校验，实际硬禁令由正向制作合同表达；这与当前三个网关单字符串能力一致，但后续若某 Provider 增加独立 negative 参数，需要重新评估。
3. 多人案例有 5 张参考图，而 Grok 最多使用 3 张；当前会保留两名高优先级角色和场景并记录省略项。运行评测必须按实际使用参考图评分，不能把省略角色的身份漂移全算作 Prompt 文案失败。

## 7. R4 决策

- R3 代码不回退。
- R5 暂不放行。
- 下一阶段先完成 R4.1：修正 V1/V2 真实测试入口，并把动态镜头合同改为真正的 Provider 语言编译；同时冻结 Grok 参考能力例外的评分规则。
- R4.1 完成后重新执行一次小范围静态复核；通过后再向用户说明准确请求数量和成本边界，等待明确授权。
