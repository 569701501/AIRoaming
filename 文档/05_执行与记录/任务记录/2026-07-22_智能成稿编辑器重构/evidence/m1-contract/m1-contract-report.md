---
doc_id: AIR-EVD-20260722-SMART-LAYOUT-M1
status: passed
created: 2026-07-22
updated: 2026-07-22
owner: AI漫游项目
audience: human, ai-agent, developer, qa
source: M1 LayoutDocumentV2 与编辑保护实现及验证
---

# M1 LayoutDocumentV2 与编辑保护证据

## 1. 结论

M1 Shared/兼容基础通过。`LayoutDocumentV2` strict codec、V1 WC 保守升级、V2→V1 临时投影、dialogue binding/protection、Command actor、绑定气泡语义命令和 V2 inverse 已实现。现有 V1 可见摘要和真实 G5 renderer/publication 路径未改变。

本结论不表示 V2 已进入 Server Working Copy、Revision 或 Web；这些仍属于 M4/M5/M8。

## 2. 实现入口

| 文件 | 作用 |
| --- | --- |
| `packages/shared/src/layout/automation.ts` | V2 types/codec、composition metadata、binding/protection、升级/投影、digest helper |
| `packages/shared/src/layout/commands-v2.ts` | actor、字段保护、smart guard、语义气泡命令、批次/inverse |
| `packages/shared/src/layout/automation.spec.ts` | strict codec、8 fixture 往返、binding 不变量、composition digest、render plan golden |
| `packages/shared/src/layout/commands-v2.spec.ts` | protection mapping、锁、释放、气泡 suppress/restore/copy、50 命令 inverse |
| `packages/shared/src/layout/index.ts` | 导出 V2 合同 |
| `package.json` | `test:smart-layout:m1` 可重复验证入口 |

## 3. 合同证据

| 验收 | 证据 | 结论 |
| --- | --- | --- |
| `SML-STA-002` | V2 根/automation/composition/binding/protection 未知字段、非法 target/scope/重复 scope 拒绝；可见字段复用 V1 strict codec | passed |
| `SML-STA-003` | 8 个固定 V1 fixture 全部 `V1→V2→V1` 对象和值摘要相等；升级只返回新对象 | passed |
| `SML-STA-004` | 窄 composition digest 对额外 task/time/path/URL 字段不敏感，非法 policy 拒绝 | passed |
| `SML-STA-007` | binding 唯一、排序、placed 可见、suppressed hidden/null、Shot 一致性均有反例 | passed |
| `SML-DLG-007` | 用户改文保留 binding 并只保护 text；smart 可移动但不能改回文字 | passed |
| `SML-DLG-008` M1 子合同 | hide/delete 形成 `user_suppressed` 或 null tombstone，restore 与 inverse 完整；publication warning 尚待 M7 | passed_partial |
| `SML-DLG-009` | 复制 bound balloon 后仅原元素保留 binding，副本 unbound | passed |
| `SML-PRO-001～009` | crop/text/geometry/style/tail/source/reading order、lock、clear、50 条批次、V1 explicit preserve | passed |
| `SML-PRO-010` M1 子合同 | 通用 delete/hide fail-closed，语义 suppress/restore 与 inverse 完整；Web 确认尚待 M5 | passed_partial |
| `SML-REG-004` | 8 fixture 当前 V1 render plan 与 V2 临时投影完全相等；真实 renderer gate green | passed |

## 4. 验证命令与结果

### M1 聚焦合同

```text
pnpm test:smart-layout:m1
Test Files 2 passed
Tests 15 passed
```

### Shared 全量

```text
pnpm --filter @airoaming/shared test
Test Files 29 passed
Tests 182 passed
```

### 全仓类型

```text
pnpm typecheck
packages/shared: passed
apps/server: passed
apps/web: passed
```

### 真实 G5 renderer/publication

```text
pnpm test:render
G5 fixture contract: 3 passed
Shared publication: 4 passed
Chromium renderer: 5 passed
DB publication recovery: 1 passed
stage gate: green
```

覆盖真实 PNG/PDF 三次同 SHA、20 段条漫切片像素精确重组、CJK 字体 PDF 和 DB publication recovery。

### 全仓并行回归说明

根命令 `pnpm test` 中 Shared 182/182 通过，Server 739 项通过；并行高负载下既有 `app-backup-restore.integration.spec.ts` 与 `cutover-cli-guards.spec.ts` 共 18 项触发固定 5 秒超时。两份失败文件随后隔离复跑：

```text
cutover-cli-guards.spec.ts: 4/4 passed
app-backup-restore.integration.spec.ts: 40/40 passed
```

因此这些为全仓并行资源竞争，不是 M1 功能回归；未修改其 timeout 或测试实现来掩盖现象。

## 5. Static/Scrutiny Review

- V2 没有新增可见元素种类；renderer 只接收 `projectLayoutDocumentV2ToV1` 的临时 V1 值。
- `LayoutDocumentCodecV1` 继续拒绝 V2，避免旧代码把 V2 当 V1 覆盖保存；`LayoutDocumentCodecV1OrV2` 才能保留 schema。
- V1 WC 升级函数是纯函数，不读取或写入数据库，不迁移历史 LayoutRevision，不重算旧摘要。
- protection target/scope 有类型矩阵；smart 删除也按全部适用 scope 检查，不能通过删除绕过保护。
- 用户删除无绑定对象会清理悬空 protection；smart/system 不会自动释放现有保护。
- M1 没有修改 Prisma、migration、Server service、Web、Provider 或真实用户项目。

结论：`passed`。

## 6. Runtime/User Review

M1 未改产品页面，真实浏览器编辑路径不适用。运行时兼容通过真实 G5 Chromium renderer 与 DB publication recovery 验证；页面级 V2 保存、确认弹窗和 feature gate 留待 M4/M5/M8。

## 7. 残留边界

- Server 仍按 V1 保存 Working Copy/Revision；不得把 Shared M1 完成表述为 V2 产品已上线。
- publication preflight 尚未把 `user_suppressed`/人工改文投影为 warning。
- Web 尚未把 bound balloon 通用 delete/hide 转为语义确认。
- M2 才会生成正式 dialogue item、binding、规则布局、裁切、气泡和覆盖账本。
