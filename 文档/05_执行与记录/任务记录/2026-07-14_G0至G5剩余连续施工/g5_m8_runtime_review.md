---
doc_id: AIR-G05-M8-RUNTIME-001
status: active
created: 2026-07-15
updated: 2026-07-15
owner: AI漫游项目
audience: human, luna, developer, qa
source: DB-only Playwright、固定 renderer、migration gate、完整 package 回归
---

# G5-M8 运行技术复核

## 结论

```text
technical_runtime = passed
human_acceptance = waiting
current_state = WAIT_G5_USER_ACCEPTANCE
```

## 运行路径

| 路径 | 结果 | 证据 |
| --- | --- | --- |
| A 页漫 | PNG/PDF 可解码，固定输入三次摘要一致，正式输出无编辑控制层 | M7 renderer + M8 全量回归 |
| B 条漫 | 20 段 38,400px 输出按切片顺序像素级精确拼回；段高与 profile resize 一次 Undo | renderer 5/5；M8 Playwright |
| C 返修 | 旧 Revision/Publication 保留；source drift 拒绝旧 preview/pending apply | P6/G4-D 集成；M6/M8 Playwright |
| D 故障 | 多标签 CAS、restart/staged recovery、late historical 不切 current | Server 全量回归与 M7 故障路径 |
| E 手机/AI | 手机 0 写请求；AI preview/discard 不改 WC，apply 后一次 Undo，stale source 拒绝 | G5 Playwright 8/8 |

## 最终门禁

- Shared：115/115。
- Server：568/568。
- G5 E2E：8/8。
- render report：green。
- migration report：green。
- typecheck、E2E typecheck、build、Prisma：全部退出 0。

## 边界核对

- 未访问真实 provider、真实 key 或外网素材。
- 未删除 backup/archive，未执行 down migration 或 file-only 回退。
- 未进入 G6、素材包 ZIP 或视频链路，未 push。

本记录证明技术运行路径通过，不代替用户最终签收。
