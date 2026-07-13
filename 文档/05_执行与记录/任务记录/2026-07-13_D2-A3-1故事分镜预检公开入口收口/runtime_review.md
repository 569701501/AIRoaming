---
doc_id: AIR-D2-A3-1-RUNTIME-001
status: completed
created: 2026-07-13
updated: 2026-07-13
owner: AI漫游项目
audience: reviewer, developer, qa
source: A3-1 runtime review
---

# Runtime Review

## 结论

通过。验证使用 fresh SQLite、临时 workspace 和隔离 Nest context；旧入口全部稳定拒绝且项目/章节事实计数不变。G2 modern replacement 的成功、CAS、projection、restart、freshness 证据由全量测试复核。

## 运行证据

`A3-1: legacy story/storyboard/preflight writes are retired with G2 replacements` 逐个调用：

- `confirm_story_structure`、`update_story_structure`
- `confirm_image_preflight`、`resolve_image_preflight_character`
- `save_pending_storyboard`、`confirm_storyboard`、`update_storyboard`

每项均返回 HTTP 409 `LEGACY_WRITE_ROUTE_DISABLED`，details 含 operation 和 replacement；调用前后临时 DB projects/chapters 仍为 1/1。

## 复用的 modern 证据

- Story pending/update/confirm/discard/replay with projections。
- Storyboard pending/stable-shot/confirm/retire。
- Preflight confirm 后上游 Storyboard 更新触发 stale。
- 各路径含 fresh SQLite 与重启读取验证。

## 不执行项

未触碰真实 workspace、真实 DB、用户凭据、Keychain、provider、Character/Asset public write、Outbox、final importer、M6 或真实 cutover。
