---
doc_id: AIR-G4-B-RUNTIME-001
status: completed
created: 2026-07-15
updated: 2026-07-15
owner: AI漫游项目
audience: human, ai-agent, developer, qa
source: G4-B 单元、回归、类型与构建结果
---

# G4-B 运行复核

## 1. 结论

```text
phase = G4-B
result = passed_isolated
user_path = not_applicable_until_G4-C_E_F
```

G4-B 是无 IO 的规则层，没有新公开 API 或页面动作。隔离运行已证明规则可执行且结果稳定；G4 总体 Runtime/User Review 仍为 `not_run`。

## 2. 已运行路径

1. 表驱动执行 unset/finalized/cleared 的合法、非法、no-op 与 exact replay。
2. 对 active/retired、missing/clear/broken/candidate/asset/source applicability 组合求 lock set。
3. 使用独立 Node SHA-256 对固定 JCS 字节求值，与 resolver known-answer 比对。
4. 交换数据库输入行顺序、修改展示字段并复算 lock set/impact，摘要保持一致。
5. 投影 legacy 与 LayoutDocumentV1 图片绑定；验证 unresolved 信封保留证据但不提升为 current。
6. 组合 current/stale/unresolved/historical 与 digest mismatch，验证 Layout/Export freshness。
7. 组合 Working Copy、同 element 多 role、Layout、Export、活动/完成/跨章节任务，验证影响集、去重与 digest 变化。

## 3. 未执行

- 未对真实目标 DB 写入候选修订，未调用 preview/commit/history/favorite/reject/complete API。
- 未执行双 writer、丢响应、任务取消、迟到结果、页面弹窗或 G4 八条用户路径。
- 未删除 backup/archive，未执行 down migration、file-only 回退或 G6/视频链路。
