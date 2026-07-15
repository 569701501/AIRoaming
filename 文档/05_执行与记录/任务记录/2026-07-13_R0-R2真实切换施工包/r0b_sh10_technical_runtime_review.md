---
doc_id: AIR-RCUT-R0B-SH10-TECH-RUNTIME-001
status: passed_release_shadow_technical_waiting_human
created: 2026-07-14
updated: 2026-07-14
owner: AI漫游项目
audience: runtime-reviewer, migration-reviewer, release-owner, ai-agent
source: fixed release 29f40bb、fresh C/D shadow、db:verify、permission/secret scan
---

# R0-B SH-10 技术整改 Runtime Review

## 运行结论

fresh C/D 的 release-specific shadow、逐 slice verify、pre-SH09 count checkpoint、secret scan 与权限复核全部通过。没有 UI/用户点击路径，本阶段 Runtime 仅覆盖迁移证据链。

## 运行证据

| 检查 | C | D |
| --- | --- | --- |
| full shadow | 16/16 succeeded | 16/16 succeeded |
| aggregate reportDigest | `sha256:daca7e92...663e781` | `sha256:daca7e92...663e781` |
| warningCount | 1 | 1 |
| table count | 45 | 45 |
| table-count digest | `sha256:beb518e2...cfabc5c` | `sha256:beb518e2...cfabc5c` |
| PersistenceState count | 0 | 0 |
| db:verify | 16/16 passed | 16/16 passed |
| integrity/FK | ok / 0 | ok / 0 |

- checkpoint 后再次计算 DB SHA256，C/D 均与 checkpoint 内绑定值一致，证明 verify 未改变数据库。
- canonical roots 扫描 735 files、6 份 SQLite dump，sentinel hit=0。
- 外置根 381 directories、1240 files，权限 violation=0。
- source pre/post 仍只有授权 `structure.json` 新增；无 removed/changed。

## 执行中纠偏

- 首次直接对不存在的 SQLite 文件执行 `prisma migrate deploy` 返回 schema engine error；未进入 importer、未修改 source。按 production C3 runner 的既有顺序先创建 0600 空 SQLite 文件后，10 migrations 正常部署。
- 首次 `db:verify --workspace-root` 错传 target workspace，release identity 无法加载；该参数在当前实现中用于定位 release schema。改传固定 release root 后 C/D 32/32 通过。

## 边界

没有执行 final importer、真实维护 API、默认 Keychain、真实凭据、SH-10 签名、AUTH 或 C0～C7。
