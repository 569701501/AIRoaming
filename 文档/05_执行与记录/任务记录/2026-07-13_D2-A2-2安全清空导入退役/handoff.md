---
doc_id: AIR-D2-A2-2-HANDOFF-001
status: active
created: 2026-07-13
updated: 2026-07-13
owner: AI漫游项目
audience: human, ai-agent, developer, qa
source: D2-A2-2 master contract
---

# D2-A2-2 安全清空、导入与退役 Handoff

目标：关闭旧 clear/import/reset 写入口的危险语义，同时不删除任何 formal history、不回退 milestone、不伪造成功。DB 模式只能使用 G2 Working Copy/Pending CAS；整项目 reset/import 必须明确退役并返回可执行的逐章 replacement。

执行顺序：先读本目录五份资料；补 retired capability registry；实现稳定 rejection/替代路径；fresh SQLite 验证；Scrutiny/Runtime Review；独立提交后进入 D2-A3-1。

禁止：物理删除 Chapter/ScriptVersion/Outline/下游历史；修改 0001～0010/schema/trigger；A3、Outbox、final importer、M6、真实数据和凭据。

完成后：`project_chapter_script` implemented、7 个 legacy operation 为合规 `retired`、`blockedIds` 精确降为 5；其他 capability 字节语义不变。
