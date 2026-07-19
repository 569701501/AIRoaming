---
doc_id: AIR-TASK-20260719-CANDIDATE-REFERENCE-COMPILER-RUNTIME
status: completed
created: 2026-07-19
updated: 2026-07-19
owner: AI漫游项目
audience: human, ai-agent, developer, qa, reviewer
source: 标准 DB 真实素材、最终代码、任务计划与测试证据
---

# 候选图必需引用编译 P0 Runtime/User Review

## 结论

- 非付费运行合同：`passed_non_paid_runtime_contract`
- 真实 Provider 视觉 A/B：`not_run`
- 真实图片 Provider 调用：`0`
- 标准数据库写入：`0`

## 复核方法

以只读方式检查 `/Users/liyadong/.airoaming/data/db/airoaming.sqlite`，解析当前正式分镜中的真实三人镜头，读取并解码其角色 preview/final 与场景 WebP；随后只在内存中调用最终身份板与引用计划编译逻辑。未创建 GenerationTask、Candidate 或 Asset，未修改项目文件，临时查看文件已删除。

## 真实样例

- Shot：`shot_6e2394d093f90f395f8167fb405d7930`
- 场景：`scene_01`，Asset `d83d02e9-ada7-4e0d-9659-809d7f722b07`
- 阿肃 preview Asset：`64c0c1ff-f014-47fa-ba18-a459c907fc88`
- 铁锚 preview Asset：`f15394f3-3b90-4cae-b676-370e5e87afbd`
- 小棠 preview Asset：`d312b971-2a70-4606-a49e-79bcf541bbdf`

三张 final 均为 864×1152，但阿肃、小棠是横向四视图，铁锚是 2×2 四视图；这证明尺寸相同也不能推断固定格位。三张 preview 均是各角色唯一、版本早于 final 的 ready 单人正面身份图，因此也满足旧空来源资产的严格兼容条件。

## 运行结果

| 项目 | 结果 |
| --- | --- |
| 原始必需条件 | 3 个角色 Asset + 1 个场景 Asset |
| Grok 物理输入 | 2 张：角色身份板 + 独立场景 |
| 身份板 | 2016×944，3 列 × 1 行，单元 640×896 |
| 角色顺序 | 阿肃 → 铁锚 → 小棠 |
| 原始覆盖 | 4/4 Asset |
| `omittedRequired` | `[]` |
| 新增排版元素 | 无姓名、编号、格线、边框或水印 |

源角色图自身存在的服装符号/文字没有被破坏性擦除；Provider Prompt 会要求忽略身份板排版和可见符号，但是否被真实模型复制仍属于后续视觉 A/B。

## 用户路径判定

本轮没有改候选图工作台操作：用户仍选择镜头并生成候选，系统在后台按 Provider 自动直传或打包。运行证据证明真实资产能被编译成不丢角色、不丢场景的请求合同；没有证明最终成图已经达到可定稿视觉质量。

## 后续视觉验收

若用户重新授权付费测试，使用同一组冻结资产分别验证 OpenAI、Doubao、Grok，并逐角色评分存在、脸部身份、服装、动作主客体和站位，逐场景评分地标、空间和光向，同时记录拼贴/文字污染。若关键角色仍失败，下一步应做基于 mask 的单角色区域修复，而不是继续把更多内容压进一张图。
