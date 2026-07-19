# 任务计划：视觉素材门禁前置

---
doc_id: AIR-TASK-20260719-VISUAL-PREFLIGHT-PLAN
status: completed
created: 2026-07-19
updated: 2026-07-19
owner: AI漫游项目
audience: human, ai-agent, developer
source: 用户确认“剧情结构确定素材要求、出图准备只检查”的产品决策，ADR-0018
---

## 目标

让剧情结构、角色素材操作、分镜引用和出图准备共用同一份视觉素材要求，彻底消除“确认分镜后才突然要求角色定稿”的循环依赖。

## 非目标

- 不增加新的顶部阶段、页面或用户确认节点。
- 不修改现有 StoryStructure 页面字段和数据库 Story/Storyboard 文档字段。
- 不在出图准备生成、修改或自动补齐图片。
- 不新建完整道具库或通用 Elements 平台；本轮只在现有 `human/creature/group/voice` 分类内闭合规则。
- 不调用任何付费图片 Provider。

## 统一规则

| 结构分类 | 必需素材 | 说明 |
| --- | --- | --- |
| `human + lead/recurring/chapter` | `final_reference` | 人类主角、常驻和本章关键角色需要四视图定稿 |
| `human + minor/extra` | `preview_front` | 小角色和背景角色只需单张身份参考 |
| `creature` | `preview_front` | 非人生物使用非人物单张视觉参考，不生成人物四视图 |
| `group` | `preview_front` | 群体使用群体视觉参考，不生成人物四视图 |
| `voice` | `none` | 纯声音角色不要求图片 |

`appearanceCount` 只作为出图准备展示信息，不再改变必需素材类型。

## 当前阶段

全部阶段完成。

## 阶段列表

### 阶段 1：事实源与决策冻结
- [x] 读取产品、架构、角色定稿、出图准备和验收文档。
- [x] 复核当前代码中的三份门禁和按钮延迟根因。
- [x] 写 ADR-0018 与本任务计划。
- **状态：** completed

### 阶段 2：测试先行与共享契约
- [x] 新增共享视觉素材要求判定器及固定矩阵测试。
- [x] 新增群体别名归并和分镜越界角色负向测试。
- [x] 将 DB 预检来源策略升级为 v2，并保留 v1 兼容读取。
- **状态：** completed

### 阶段 3：Worker 实现
- [x] 结构确认后按分类排队必要预览，纯声音跳过。
- [x] 剧情结构页不依赖正式分镜即可显示正确操作。
- [x] 收紧分镜角色引用到当前确认结构。
- [x] 出图准备按统一规则选择 final/preview/none，保持纯检查。
- [x] 为 creature/group 使用适配的 V2 预览 Prompt。
- **状态：** completed

### 阶段 4：自动验证
- [x] 运行 Shared/Server 定向测试。
- [x] 运行 Server 全量、workspace typecheck 和 build。
- [x] 运行 DB Web 门禁/E2E 回归。
- **状态：** completed

### 阶段 5：Scrutiny Review
- [x] 静态复核代码、ADR、契约、测试与 Handoff。
- [x] 确认没有页面字段、数据库 Schema 或付费调用扩张。
- **状态：** completed

### 阶段 6：Runtime/User Review
- [x] 浏览器验证剧情结构页按钮不依赖 `snapshot.shots`，并由静态/测试锁住分镜前规则。
- [x] 验证 creature/group 不出现人物定稿，voice 不出现生图要求。
- [x] 验证出图准备只展示检查结果；缺项阻断由自动回归覆盖。
- [x] 验证全程没有新增图片任务或 Provider attempt。
- **状态：** completed

### 阶段 7：交付与留痕
- [x] 更新产品、模块、验收与长期记忆。
- [x] 新增功能完成记录。
- [x] 汇总残留风险和后续道具元素方向。
- **状态：** completed

## 验收标准

1. `human + chapter` 在确认剧情结构后、尚未确认分镜时就能看到定稿动作。
2. `creature/group` 只要求单张视觉参考，不出现人物四视图定稿动作。
3. `voice` 不自动排图片任务，也不阻塞出图准备。
4. `human + minor/extra` 即使正式分镜重复出现，也不会在出图准备阶段被临时升级为四视图要求。
5. 分镜不能引用当前确认剧情结构之外的项目角色；违规在分镜落库前失败。
6. 同一 `group` 的保守别名（例如“商队众人/商队多人”）映射到同一个项目 Character，不产生两份素材要求。
7. 出图准备仍依赖正式分镜，仍是缺项即阻断的纯检查门，不提供生成或修复动作。
8. 旧 `preflight-source-v1` 可读取但不再被视为当前策略下可直接复用，必须重新预检确认。
9. 不增加 StoryStructure/Storyboard 页面字段、数据库 migration、顶部步骤或付费图片调用。

## 已做决策

| Decision | Rationale |
| --- | --- |
| 素材要求由 `level + entityType` 决定 | 两者在剧情结构确认时已经存在，不依赖下游镜头 |
| `appearanceCount` 降为展示信息 | 避免分镜事后改变上游要求 |
| 出图准备保持纯检查 | 用户明确要求，且符合生产前门禁职责 |
| v1 兼容读、v2 作为新策略 | 让旧历史可查看，同时避免旧确认绕过新规则 |
| 本轮不新增 `prop/object` | 当前数据结构尚未稳定支持通用视觉元素，先解决已发生的循环和类型误用 |

## 阻塞项

无。所有规则均已由用户确认，可在现有模型内实施。

## 当前深思熟虑角色边界

- Orchestrator：维护本计划、ADR 和阶段退出条件，不写功能代码。
- Worker：按阶段 2/3 实现，不改变未列入范围的工作树改动。
- Scrutiny Review：只读检查 diff、测试和契约，不修代码。
- Runtime/User Review：使用本地浏览器验证真实页面，不调用图片 Provider。
