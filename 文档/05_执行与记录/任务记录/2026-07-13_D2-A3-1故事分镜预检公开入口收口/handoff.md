---
doc_id: AIR-D2-A3-1-HANDOFF-001
status: active
created: 2026-07-13
updated: 2026-07-13
owner: AI漫游项目
audience: developer, ai-agent, qa
source: D2-M6 continuous handoff P3
---

# D2-A3-1 Story/Storyboard/Preflight Handoff

目标：关闭旧 `ProjectsService` 的 Story/Storyboard/Preflight 文件式公开写入口，统一使用已有 G2 DB Working Copy、CAS、projection、current/pending 和 PreflightRevision API。旧入口在 DB 模式稳定返回 409，并提供准确 replacement；file mode 保持原行为。

关闭 operation：`confirm_story_structure`、`update_story_structure`、`confirm_image_preflight`、`resolve_image_preflight_character`、`save_pending_storyboard`、`confirm_storyboard`、`update_storyboard`。

完成后：`outline_story_storyboard_preflight` aggregate 为 implemented；7 个 operation 具备 retired reason/replacement/evidence；`blockedIds` 从 5 降至 4。

禁止：修改 schema/0001～0010/G1 generator；在 DB 模式写 `LocalProject`、扫描/覆盖 `structure.json`、`storyboard.json`、`preflight.json`；伪造 ready、绕过 source digest/CAS；触碰 Character/Asset/CandidateLock、Outbox、final importer、M6、真实数据和凭据。
