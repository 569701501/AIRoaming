---
doc_id: AIR-REVIEW-20260712-G3-CORE-RUNTIME
status: passed
created: 2026-07-12
updated: 2026-07-12
owner: AI漫游项目
audience: human, ai-agent, developer, qa
source: G3-core 临时运行环境复核
---

# Runtime/User Review

## 复核结论

结论：\`passed\`（临时环境）。未连接真实 workspace、真实数据库或真实 provider；G3-core 的用户入口和 DB runtime 行为在隔离环境可运行。

## 已验证路径

- file mode 新建项目必须选择 canonical 漫画版式；弹窗提交期间按钮和关闭动作受 loading 状态保护，字段错误不污染项目列表全局错误。
- file mode 读取 \`page_horizontal\` 项目时，内存/API runtime 为 \`paged_comic\`，无关章节保存后 \`project.json\` 仍保留 \`page_horizontal\`。
- 0010 在 fresh G1+G2 SQLite 上部署后，直接更新 \`comic_format\` 被固定错误 token 拒绝，同值 UPDATE 也拒绝，其他项目字段更新不受影响。
- DB mode 使用完整 0001～0010 ledger 可启动；缺 0008 或缺 0010 时在业务写入前 fail-closed；DB-only Project/Chapter/Script 与 G2 runtime 重启测试通过。
- Candidate/Prompt V2 生成和 persistent image task 使用同一尺寸策略与宽高；旧 V1/缺策略 promptSpec 不进入新 worker 执行路径。

## 证据

- \`corepack pnpm --filter @airoaming/server test\`：36 个测试文件、195 个测试通过。
- \`src/persistence/g3-overlay-contract.spec.ts\`：fresh 0001～0009 + 0010 真实 SQLite 检查通过。
- \`src/projects/project-db-persistence.integration.spec.ts\`：13 个 DB-only 隔离测试通过。
- \`src/projects/project-repository.spec.ts\`、\`legacy-project-comic-format.spec.ts\`：file alias/provenance 通过。

## 未覆盖

- 没有真实生产 workspace 发布切换、真实用户浏览器截图、真实 provider smoke。
- G3-M importer、决议、备份恢复、final import 和 DB-only activate 未执行。
