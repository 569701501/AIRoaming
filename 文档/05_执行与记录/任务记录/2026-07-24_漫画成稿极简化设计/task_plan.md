---
doc_id: AIR-TASK-20260724-MANGA-MINIMAL-DESIGN
status: complete
created: 2026-07-24
updated: 2026-07-24
owner: AI漫游项目
audience: human, ai-agent, developer, qa
source: 用户要求继续简化漫画成稿方案并删除非必要内容
---

# 漫画成稿极简化设计任务计划

## 目标

在不牺牲内容正确、人工微调、版本追溯和确定性出版的前提下，把漫画成稿收敛为一条普通用户可理解的主路径，并明确删除、合并、内收的现有能力。

## 非目标

- 本轮不直接修改生产代码、数据库或测试成稿。
- 不新增第二套简化编辑器。
- 不删除 Working Copy、Revision、Publication、来源密封、CAS、Undo/Redo 等数据安全能力。
- 不扩张到滤镜、像素修图、无限画布或新 `LayoutDocumentV3` 字段。

## 强制验收

- 明确唯一普通用户路径和最多三个深接口。
- 对每个现有大能力给出“保留 / 合并 / 内收 / 删除”判定。
- 正式对白、旁白和镜头覆盖必须在 Working Copy 可阅读前闭合，而非仅在出版末端发现。
- 旧错误稿必须有受限、可撤销的 binding/气泡修复命令；不能先 fail-closed 再让用户无路可走。
- Web 不理解 rowVersion/digest，但 autosave、建议、来源更新、恢复和发布必须通过 opaque draft token 保留 CAS。
- 方案兼容 V1 历史、V2 编辑保护、来源 freshness、不可变 Revision 和 Publication。
- 给出可独立实施、可回滚的垂直切片。

## 阶段

1. 读取事实源并盘点接口、页面与正确性门。
2. 形成三种差异明显的最小设计。
3. 使用删除测试和兼容约束选择最终方案。
4. 经独立静态复核补齐内容修复、自定义身份、opaque CAS 和 shadow 切换。
5. 写入 ADR、实施切片、静态复核和任务交接。

## 决策原则

1. 来源内容正确优先于功能数量和视觉花样。
2. 普通用户只看到业务动作；摘要、digest、rowVersion、task、CAS 留在内部。
3. 一个意图只保留一个入口；同义作用域由当前选择自动推断。
4. 同一份 `LayoutDocumentV2` 贯穿自动成稿、手调、预览、版本与出版。
5. 删除 UI 不等于删除安全边界；高风险能力可内收为自动流程。

## 退出标准

- ADR 明确取代或收缩 ADR-0019 中过度暴露的产品路径，但不破坏其数据不变量。
- 有可执行的删除矩阵和迁移顺序。
- Scrutiny Review 无 S0/S1 阻断。
- Runtime/User Review 标记为设计阶段不适用，并列出实施后的真实页面验收要求。
