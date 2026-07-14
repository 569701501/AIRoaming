---
doc_id: AIR-G05-EVIDENCE-G5-M0-001
status: completed
created: 2026-07-15
updated: 2026-07-15
owner: AI漫游项目
audience: human, luna, reviewer, qa
source: G5-M0 实际命令输出摘要
---

# G5-M0 命令与红灯证据

## 通过项

| 命令 | 结果 |
| --- | --- |
| `pnpm g5:fixtures:generate` | 两次生成均得到 8 fixtures 和同一 corpus digest `sha256:9acf40013492dd82003fc24af944897db834203e11d02cacee1c457ebe115527` |
| `pnpm test:g5:fixtures` | 连续三次 3/3，通过；0 skip/todo |
| Server 定向旧 copy-export witness | 1/1，通过；临时 workspace 内 output bytes 与 source bytes 完全相同 |
| `pnpm --filter @airoaming/server test` | 80 files、536 tests，通过 |
| `pnpm typecheck:e2e` | exit 0 |
| `pnpm typecheck` | Shared/Web/Server 全部 exit 0 |
| `pnpm build` | Shared/Web/Server 全部 exit 0；仅保留既有 Web chunk size warning |
| `git diff --check` | exit 0 |

## 预期红灯

以下命令在 M0 必须非零，且失败原因来自 corpus manifest，不是命令缺失、编译错误或测试崩溃：

| 命令 | exit | 稳定红灯 |
| --- | --- | --- |
| `pnpm test:render` | 1 | `G5_RENDERER_NOT_SELECTED`、`G5_BROWSER_SEMANTICS_NOT_CAPTURED`、`G5_CONTROLLED_CJK_FONT_PENDING_E0_LICENSE_AUDIT` |
| `pnpm test:migration:g5` | 1 | `G5_LEGACY_LAYOUT_MIGRATION_NOT_IMPLEMENTED`，owner=`G5-M8` |
| `pnpm test:e2e:g5` | 1 | `G5_EDITOR_VERTICAL_SLICES_NOT_IMPLEMENTED`，owner=`G5-M3_TO_M8` |

这些红灯不能作为默认 `pnpm test` 的失败项；后续对应里程碑必须以真实实现和证据移除 manifest 红灯，禁止直接改为 exit 0。
