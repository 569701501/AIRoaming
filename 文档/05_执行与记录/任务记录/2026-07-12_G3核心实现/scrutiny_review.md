---
doc_id: AIR-REVIEW-20260712-G3-CORE-SCRUTINY
status: passed
created: 2026-07-12
updated: 2026-07-12
owner: AI漫游项目
audience: human, ai-agent, developer, qa
source: G3-core 实现静态复核
---

# Scrutiny Review

## 复核结论

结论：\`passed\`。G3-core 的固定 migration、runtime ledger、API/DTO、file 兼容、Candidate V2 和 Web 状态与施工资料的边界一致；未发现重新引入旧 alias 到 HTTP/DB/new artifact 的路径。

## 静态证据

- \`0010_g3_comic_format_immutable/migration.sql\` 仅包含一个 \`BEFORE UPDATE OF comic_format\` trigger，错误 token 为 \`AIR_G3:COMIC_FORMAT_IMMUTABLE\`。
- G3 overlay contract 检查 SQL shape、SQLite 对象集合、temp object，并验证 0001～0009 上应用 0010 后表/列/索引/CHECK 不变。
- \`g3-runtime-migration-ledger\` 精确绑定 0001～0010 checksum；\`PrismaService\` 只调用完整 G3 guard。
- Shared \`ComicFormat\` 只有 \`vertical_scroll/paged_comic\`；Create parser 必须传 canonical，PATCH 只要出现自有 \`comicFormat\` 即 409。
- file reader 只在明确 legacy 文件输入边界接受 \`page_horizontal\`；runtime 映射为 \`paged_comic\`，serializer 保留原 alias；\`four_panel/缺失/非法\` 聚合后 fail-closed。
- Candidate/Prompt V2 写入 \`sizePolicyVersion=legacy_generation_default_v1\`，persistent worker 对旧 V1 或缺失策略拒绝执行；G2 \`TaskSourceProjection.policyVersion\` 未改。

## 命令证据

| 命令 | 结果 |
| --- | --- |
| \`corepack pnpm -w typecheck\` | 通过 |
| \`corepack pnpm --filter @airoaming/server test\` | 36 files / 195 tests 全部通过 |
| \`corepack pnpm --filter @airoaming/server g1:manifest:check\` | 通过 |
| \`corepack pnpm --filter @airoaming/server g1:schema:check\` | 通过 |
| \`corepack pnpm --filter @airoaming/server g1:migration:check\` | 通过 |
| G3 overlay/ledger/parser/file/DB 专项测试 | 通过 |

## 残留风险

- G3-M maintenance importer、MigrationIssue 决议、备份恢复和 DB-only activate 尚未实现；因此本结论不等同 production-ready。
- 尚未执行真实 workspace 发布切换或真实 provider smoke；本轮只使用临时 workspace/SQLite/fake provider。
