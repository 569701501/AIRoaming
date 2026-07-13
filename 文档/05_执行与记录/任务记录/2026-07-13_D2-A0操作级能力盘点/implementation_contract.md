---
doc_id: AIR-D2-A0-CONTRACT-001
status: active
created: 2026-07-13
updated: 2026-07-13
owner: AI漫游项目
audience: human, ai-agent, developer, qa
source: D2-A0 handoff
---

# D2-A0 实施契约

## 1. 类型契约

保留现有聚合类型：

```ts
type CapabilityStatus = "implemented" | "partial" | "unsupported";
```

新增操作级类型：

```ts
type OperationReadStatus = CapabilityStatus | "not_applicable";

interface DbCapabilityOperation {
  operation: string;              // 与 assertDatabaseOperationSupported 参数完全相同
  capabilityId: string;           // 必须引用 8 个聚合 capability 之一
  ownerModule: string;
  sourceFile: string;             // 仓库相对路径
  sourceSymbol: string;           // 类/服务方法
  readStatus: OperationReadStatus;
  writeStatus: CapabilityStatus;
  evidenceTestIds: string[];      // 相对测试文件#稳定用例名
}
```

D2-A0 的所有操作都是写门禁，因此 `readStatus="not_applicable"` 是有意的，不得用 `implemented` 冒充存在读路径。

## 2. 状态规则

- `writeStatus=implemented` 必须有至少一个稳定 `evidenceTestIds`。
- `writeStatus=partial` 也必须有证据，并在聚合 blocker 中说明剩余缺口。
- `writeStatus=unsupported` 的 `evidenceTestIds` 必须为空。
- file-mode、内部 repository、shadow importer 的测试不能单独证明公开 Service DB 写入口。
- `sourceFile` 必须能在当前仓库找到，`sourceSymbol` 必须能定位到对应 Service/Repository 方法。

## 3. 聚合计算

`getBlockedDbCapabilities(registry, operations)` 的 required 项在以下任一条件成立时返回 blocked：

1. 聚合 `readStatus` 或 `writeStatus` 不是 `implemented`；
2. 聚合未覆盖 restart 或无聚合证据；
3. 同 capability 下任一操作 `writeStatus` 不是 `implemented`；
4. 同 capability 下任一操作没有证据。

这样内部 repository 已完成但公开门禁仍未完成时，不能得到错误的聚合绿灯。

## 4. 不变量

- 操作名唯一，且与源码扫描得到的操作集合完全相等。
- registry getter 返回深拷贝，调用方修改结果不得污染静态 registry。
- CLI 只读取静态 registry，不创建 Prisma、不读取 workspace、不读取 settings。
- `--check` 继续 fail-closed；D2-A0 不得把任何当前 required blocker 变成绿色。

## 5. 非目标

- 不删除或放宽 `ProjectRepository.assertDatabaseOperationSupported()`。
- 不把所有 gate 改成真正可写。
- 不实现 SecretStore、Outbox、Dialogue、Layout/Export 或 final importer。
