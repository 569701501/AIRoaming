---
doc_id: AIR-TASK-20260711-G3-COMIC-FORMAT-PLAN
status: completed
created: 2026-07-11
updated: 2026-07-11
owner: AI漫游项目
audience: human, ai-agent, developer, qa
source: ADR-0009、D1漫画成品形态入口与锁定方案、G1/G2 开发级文档与现有代码审计
---

# G3 漫画版式入口与不可变约束规划

## 目标

1. 在已经存在的项目库“创建项目”弹窗中补充必选且默认空的“漫画版式”字段，不新增入口、页面或向导。
2. 将项目级 `ComicFormat` 收口为 `vertical_scroll/paged_comic`，并让创建、读取、展示和下游消费使用同一规范值。
3. 从共享 DTO、HTTP 解析、服务写入和 SQLite 四层保证创建后不可原地修改。
4. 把运行时严格解析与旧 workspace 迁移映射彻底分离，禁止正式业务静默默认或接受旧别名。
5. 明确 G3 与 G1 DB-only、G2 SourceSnapshot、G5 LayoutDocument 的接口边界和验收证据。
6. 本轮只写开发级文档，不修改 schema、migration、业务代码、数据库或真实 workspace。

## 非目标

- 不重做项目库、“创建项目”按钮、弹窗打开方式、路由或创建成功后的剧本阶段跳转。
- 不实现“复制为另一版式”、四格 LayoutPreset、自由画布或 ExportProfile。
- 不用项目版式替代镜头/画格级目标比例；G3 只保留明确标注的临时兼容适配。
- 不修改真实项目和旧 metadata；所有迁移动作仍由 G1 maintenance importer 执行。

## 强制退出标准

1. 现有 UI 改动点、字段文案、默认空、校验、错误回显和创建后只读位置明确。
2. canonical enum、创建 DTO、更新 DTO、严格 parser、错误码与 HTTP 状态明确。
3. `Project.comicFormat` 的 NOT NULL、CHECK、无默认和不可变 trigger 明确。
4. `vertical_scroll/page_horizontal/four_panel/缺失/非法` 的迁移决议与幂等规则明确。
5. 出图准备、候选尺寸、旧 LayoutPage 与 prompt 的兼容边界明确，不把旧别名写回项目。
6. red-on-slice 测试、迁移测试、API、浏览器 E2E 和重启验证清单完整。
7. Scrutiny Review 通过；Runtime/User Review 仅列未来实施步骤，不伪造已执行。

## 阶段

### 阶段 1：事实复核

- [x] 读取 ADR-0009、D1、G0、G1、G2 和项目事实源
- [x] 审计现有创建弹窗、调用路径、共享 DTO、服务和旧文件读取
- [x] 审计出图准备、候选尺寸、prompt、排版和只读展示缺口

### 阶段 2：领域与迁移契约

- [x] 收口 canonical enum、共享展示定义和严格 parser
- [x] 定义旧值迁移决议、MigrationIssue 与四格模板意图
- [x] 定义数据库 CHECK、不可变 trigger 和错误映射

### 阶段 3：用户路径与兼容边界

- [x] 明确现有弹窗的最小增量、错误回显和无障碍交互
- [x] 明确项目卡、工作台头部、第 1 步与排版页的只读展示
- [x] 明确候选尺寸和 legacy LayoutPage 的临时适配及删除时点

### 阶段 4：开发切片与验收

- [x] 拆分 G3-A 至 G3-E 实施顺序和回滚闸门
- [x] 编写契约字典、测试矩阵和 Runtime/User Review 路径
- [x] 明确与 G1/G2/G5 的交付依赖

### 阶段 5：正式文档与复核

- [x] 编写 G3 主方案、契约/迁移字典和验收清单
- [x] 同步索引、上位产品/架构/模块文档、会话和长期记忆
- [x] 完成 Scrutiny Review 与 Handoff

## 当前角色边界

- **Orchestrator：** 维护 G1 → G2 → G3 → G5 依赖，防止把数据库迁移、自由画布或复制转换提前塞入 G3。
- **Worker：** 只编写 G3 开发级文档和同步事实源，不修改实现。
- **Scrutiny Review：** 只读核对 UI/API/DB 四层锁定、迁移歧义、兼容适配和测试覆盖。
- **Runtime/User Review：** 未来实施时验证两个版式的真实创建、重启、只读展示和下游一致性；本轮只给验收步骤。

## Handoff

- 用户已确认继续 G3 文档，并澄清现有创建项目入口必须复用。
- 已完成主方案、精确契约/旧值迁移字典、验收清单和上位事实源同步。
- 三份 G3 正式文档已于 2026-07-11 获用户确认并进入 `accepted`；尚未进入实现。

## Result

- 现有创建项目按钮、弹窗、API 调用和成功跳转全部复用；只在同一弹窗补字段。
- runtime strict parser 与 maintenance legacy mapper 分离；Create 必填、普通 PATCH 见字段即 409、SQLite CHECK/trigger 硬锁。
- `page_horizontal` 自动映射，`four_panel/缺失/非法` 进入新 MigrationRun 的显式决议；四格意图保留给 G5。
- `paged_comic` 不等于横屏；旧候选尺寸和 LayoutPage 仅为带版本和删除点的临时适配。
- Scrutiny Review 通过；Runtime/User Review 本轮不适用，未来实施步骤已写入验收清单。
- 未修改 schema、migration、依赖、业务代码、数据库、密钥或真实 workspace。
