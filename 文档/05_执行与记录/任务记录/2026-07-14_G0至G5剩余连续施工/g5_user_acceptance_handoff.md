---
doc_id: AIR-G05-USER-ACCEPTANCE-001
status: completed
created: 2026-07-15
updated: 2026-07-15
owner: AI漫游项目
audience: human, luna, qa
source: G5-M0～M8 技术验收与双 Review
---

# G5 最终用户签收入口

## 当前状态

```text
G5_COMPLETE
G0_G5_COMPLETE
```

M0～M8 已执行完毕，技术 blocker 为 0；用户已确认运行结果通过并授权完成状态落档。

## 用户可核对的结果

- 页漫：多画格、图片裁切、文字/气泡、保存版本、真实 PNG/PDF 出版。
- 条漫：20 段连续布局、改高/重排、切片与像素拼回。
- 返修：旧版本和旧出版物保留，来源变化后明确 stale，重新处理后产生新版本。
- 手机：独立只读预览，没有 Working Copy、版本、出版或 AI apply 写请求。
- AI：建议先 preview，可 discard；只有 apply 才改 Working Copy，且一次 Undo 可撤回。
- legacy：可解析旧排版可转换；无法确认来源的旧排版要求明确重建；旧复制源图导出不可达。

截图证据：`evidence/g5_m8_mobile_ai.png`。完整技术结论见 `g5_m8_scrutiny_review.md` 和 `g5_m8_runtime_review.md`。

## 签收结果

用户已回复：

```text
我确认 G5 M0～M8 运行结果通过，授权将 G5 和本轮 G0～G5 标记完成；不进入 G6，不删除 backup/archive，不执行 down migration。
```

签收结论=`passed`；总体状态=`G0_G5_COMPLETE`。该签收不扩张为 G6、删除或回退授权。
