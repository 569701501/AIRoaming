---
doc_id: AIR-D2-M6-MASTER-GOAL-001
status: active
created: 2026-07-13
updated: 2026-07-13
owner: AI漫游项目
audience: human, ai-agent, developer, qa
source: D2/M6 路线与连续执行 Handoff
---

# D2 至 M6 总目标

## 1. 当前所处阶段（不是 M5）

M5-A0～A4 已完成并通过静态与临时运行复核。M5 解决的是 coordinated backup/restore 和故障矩阵，不会自动补齐业务 DB 写、final importer 或 activate。

当前实现位置是：

```text
M5 completed
D2-A0 completed
D2-A1-2 completed
D2-A2-1 completed
D2-A2-2 completed
D2-A3-1 completed
D2-A3-2A/B in_progress（Character delete 受 Outbox 约束）
M6 tooling/rehearsal passed；真实切换仍 awaiting_authorization
```

因此本轮连续施工从 D2-A3-2A/B 收口开始，不重复 M5 或已经完成的 D2-A2-1～A3-1。

## 2. 用户期望

用户不再逐阶段领取、逐阶段确认。Luna 按总目标连续推进，在内部保留顺序、测试、复核和提交门禁，只在真实切换前向用户集中申请一次授权。

## 3. 目标状态机

| 状态 | 含义 | 是否需要用户 |
| --- | --- | --- |
| `in_development` | 正在关闭 D2 capability | 否 |
| `d2_passed` | capability=0、final importer 与综合见证通过 | 否 |
| `m6_tooling_passed` | activate/cutover 工具和隔离演练通过 | 否 |
| `ready_for_real_cutover_authorization` | 代码层全部完成，只差真实环境动作授权 | 是，停一次 |
| `real_cutover_in_progress` | 已取得明确授权并执行 C0～C7 | 是 |
| `db_only_activated` | 真实 C7 和 Runtime/User Review 通过 | 是 |

本轮目标终点是 `ready_for_real_cutover_authorization`。

## 4. 三条主线

### 4.1 业务事实源闭合

Projects、Versioning、Character/Asset、Layout/Export、Dialogue、Delete/Outbox 的公开读写全部以数据库为正式事实源。旧文件在 DB 模式下只允许作为已封存迁移来源或 Asset 物理字节，不得反向改变 API。

### 4.2 迁移与激活闭合

把现有 16-slice full shadow 能力升级为真正 final runner，绑定 sealed snapshot、decisions、report、verification、effective schema identity、SecretStore 和 ready_for_activation；实现 activate 和 first-business-write 边界。

### 4.3 可恢复的交付闭合

所有高风险路径使用临时三根隔离演练，覆盖失败补偿、restart、replay、secret scan、backup restore、激活前后回滚。真实环境仍保持零触碰。

## 5. 不以代码量作为进度

进度只看可运行能力：

- capability 是否有公开 Service/API/重启证据。
- 数据是否由 DB 正式事实派生。
- final importer 是否完整覆盖 16 slice。
- backup/restore/activate 是否能在隔离 fixture 中走通。
- 失败是否 fail-closed 且可恢复。
- 是否有可复跑测试和简短复核。

不得用新增 helper、审查框架、文档数量或测试行数代替用户路径完成度。

## 6. 交付物

最终应包含：

- D2-A2～A6 业务实现与测试。
- 操作级 capability 的有证据状态。
- final importer、final verifier、cutover coordinator。
- `db:activate` CLI 与服务。
- Outbox consumer 和五类 handler。
- 临时根 C0～C7 编排/演练入口。
- 阶段进度、Scrutiny Review、Runtime Review 和完成记录。
- 一个等待真实切换授权的最终 Handoff。

## 7. 成功口径

开发成功不等于真实数据已切换。

本轮成功口径是：

```text
代码能力完整
  + 自动化与临时运行证据完整
  + 真实根零触碰
  + 只剩一次明确的真实切换授权
```
