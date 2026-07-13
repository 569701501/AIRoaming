---
doc_id: AIR-G3-M5-A4-4-TEST-001
status: active
created: 2026-07-13
updated: 2026-07-13
owner: AI漫游项目
audience: human, ai-agent, developer, qa
source: A4-RST-05/A4-REG-01 acceptance
---

# M5-A4-4 可执行测试矩阵

| 子 ID | 运行 | 必须断言 |
| --- | --- | --- |
| A4-RST-05A | 临时 bundle materialize 后扫描 data/workspace | 恢复 DB/workspace sentinel=0，文件内容与 bundle 一致 |
| A4-RST-05B | 使用恢复 DB 启动应用并 GET `/api/projects` | maintenance closed，项目可读，无业务写入 |
| A4-RST-05C | 读取恢复 DB PersistenceState | `activationState=shadow`、`cutoverRunId=null`、`firstBusinessWriteAt=null` |
| A4-REG-01A | server 全量测试 | 全部通过 |
| A4-REG-01B | workspace/server typecheck | 全部通过 |
| A4-REG-01C | G1 三项、Prisma validate、diff check | 全部通过 |

## 公共约束

所有运行使用临时根；测试后删除 target/staging；不访问真实 DB、workspace、SecretStore；不执行 final/pre-cutover/activate。
