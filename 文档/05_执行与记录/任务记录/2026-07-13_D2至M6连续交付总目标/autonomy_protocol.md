---
doc_id: AIR-D2-M6-AUTONOMY-001
status: active
created: 2026-07-13
updated: 2026-07-13
owner: AI漫游项目
audience: ai-agent, developer, qa
source: 用户“不再逐步查看”的执行偏好与项目深思熟虑流程
---

# Luna 连续执行与自动续跑协议

## 1. 目的

保留工程门禁，但移除用户逐小步确认。Luna 负责在一个总目标内完成规划、实现、测试、复核、提交和续跑。

## 2. 单阶段循环

```text
读取事实
  -> 写/更新 failing test
    -> 实现
      -> 定向测试
        -> 阶段全量回归
          -> capability/evidence 更新
            -> Scrutiny Review
              -> 临时 Runtime Review
                -> 文档/commit
                  -> 自动下一阶段
```

只要当前阶段全绿、无 P0/P1、无真实授权动作，Luna 不向用户提问。

## 3. 阶段记录

首次启动创建 `execution_status.md`：

```md
| phase | status | commit | targeted | full | scrutiny | runtime | blocker |
```

每次只更新状态变化，不记录无意义命令流水。

可在 `stage-notes/<phase>.md` 写：

- 当前范围。
- 代码事实与关键决策。
- 修改文件。
- 定向/全量结果。
- review 结论。
- 残留风险。

除重大架构变化外，不再为每阶段机械复制五份施工资料。

## 4. 提交规则

- 阶段通过后独立 commit。
- commit message 使用实际范围，例如 `feat(projects): close d2 a2 public db writes`。
- 不 stage 用户无关改动。
- 不 amend 用户已有 commit。
- 不 push。
- 提交后检查工作树；干净才自动续跑。

若大阶段必须拆：

- 中间 commit 必须可 typecheck、测试不破坏基线。
- 聚合 capability 只在该 capability 最后一子阶段更新为绿。

## 5. 复核职责

Worker 与 Reviewer 可以由同一 Luna 在同一任务内分角色执行，但行为分离：

- Worker：实现并记录证据。
- Scrutiny：只读 diff、契约、测试、capability，不修改代码。
- Runtime：只使用临时根运行真实 Service/CLI/重启路径。

Reviewer 发现问题后返回 Worker 修复，再重新 review。

不得开发任何“证明 reviewer 独立”的签名、CAS、sealed bundle、attestation 或双 reviewer 基础设施。

## 6. 自动决策权限

Luna 可自行决定：

- 内部类/函数/文件命名。
- 为可测试性进行小型重构。
- 在同一阶段内先后实现顺序。
- 新增窄 repository/service/spec。
- 对重复 helper 做局部复用。
- 选择等价的测试 fixture 组织。
- 在证据充分时新增 0011+ 小 migration 和 ADR。

Luna 不可自行决定：

- 删除正式历史。
- 回退 milestone/activation/terminal 状态。
- 改变漫画版式、七阶段产品语义或 Secret ownership。
- 使用真实数据/凭据/根。
- 执行正式 activate。
- 跳过 failed gate 或伪造 evidence。

## 7. 失败处理

### 7.1 普通失败

测试失败、类型错误、race、fixture 不完整、实现复杂，留在当前阶段诊断和修复，不向用户中断。

### 7.2 schema 缺口

先验证现有 schema 是否真无法表达；若不能，按实施契约新增 ADR + 0011+，继续本阶段。不要只因需要 migration 停止。

### 7.3 产品语义冲突

优先选择：

1. 保留正式历史。
2. 提供安全 replacement。
3. 退役危险 legacy 操作。
4. 保持公开错误稳定。

若仍存在两个互斥、用户可见且无文档裁决的方案，才停止并只问一个问题。

### 7.4 连续硬阻塞

同一阻塞至少记录三轮：

- 假设。
- 实验/证据。
- 结果。
- 下一替代方案。

三轮后仍无安全路径才标 `blocked`。不得用“工作量大”作为 blocker。

## 8. 上下文与续跑

若任务上下文压缩或中断：

- 读取本目录 `execution_status.md`、`progress.md`、`findings.md`。
- 读取最后绿色 commit 和当前 diff。
- 从第一个非 passed 阶段继续。
- 不重复已完成阶段，不重写历史 review。

## 9. 最终停点

当 P0～P12 全部通过：

- 输出最后绿色 commit。
- 输出 capability=0、final、WIT、M6 rehearsal 摘要。
- 写 `real_cutover_handoff.md`。
- 状态设 `ready_for_real_cutover_authorization`。
- 停止，不自动接触真实根。

用户下一次只需判断一次：是否授权真实 C0～C7。
