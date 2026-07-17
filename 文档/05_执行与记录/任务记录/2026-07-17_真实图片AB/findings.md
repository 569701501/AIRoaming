---
doc_id: AIR-TASK-IMAGE-RUNTIME-AB-FINDINGS-001
status: complete
created: 2026-07-17
updated: 2026-07-17
owner: AI漫游项目
audience: human, ai-agent, qa
source: 配置、工作区与图片预检
---

# 探索发现

## 配置

- OpenAI：`gpt-image-2`，自定义兼容 Base URL，凭据引用存在。
- Doubao：`doubao-seedream-4-5-251128`，火山方舟 Base URL，凭据引用存在。
- Grok：`grok-imagine-image-quality`，自定义兼容 Base URL，凭据引用存在。
- 当前 active provider 是 Grok；runner 不修改该设置，而是为每家建立只读运行配置。

## 素材

- 固定候选语料需要林舟、许澄、赵妍、高远四名角色和雨夜旧港、地下档案室两个场景。
- 工作区没有这些参考图；必须先制备同源共享参考，否则三家结果不可公平比较。
- 历史 Grok 测试图本身包含文字、气泡、边框和机器人主体，不能复用。

## 风险

- 三家自定义/官方接口的实际模型能力与配置可能不一致，首个真实请求才是最终连通性证据。
- Grok 单参考会因比例策略省略；双参考以上最多选 3 张。多人群像预期产生省略 warning。
- OpenAI/Doubao 多参考能力是否被中转完整支持，需要真实调用验证。

# 运行发现

## 连通性与尺寸

- OpenAI `gpt-image-2` 的首个多参考编辑请求返回 503；本轮只证明当前端点不可用，不能评价画质。
- Doubao 10/10 返回，但生产尺寸映射为 16:9/9:16，和冻结候选规格 3:2/2:3 不一致。
- Grok 10/10 返回，输出比例和冻结候选规格一致。

## 视觉与引用

- Doubao 对人物和场景参考复现最稳定，但请求层固定 `watermark: true`，10/10 出现“AI生成”水印；四人群像 2/2 只出现三人。
- Grok 单参考远景按生产策略 2/2 舍弃场景参考，旧港空间漂移；四人群像按三参考上限省略赵妍和高远参考，但文字描述仍生成四人且 warning 可追溯。
- Grok 双人场景一次出现斜切分格，说明禁止分格 Prompt 不是绝对保证。
- 单人 Prompt 中“终端编号区域”可能诱导数字；双人 Prompt 的动作主客体还需更强约束。

# 结论

- 当前适配下候选底图优先级为 `Grok > Doubao`；OpenAI 为证据不足，不进入质量排序。
- 下一步优先处理 provider 适配层，而不是继续堆叠通用 Prompt：Doubao 水印和尺寸、Grok 单参考/多人上限、OpenAI 503。
