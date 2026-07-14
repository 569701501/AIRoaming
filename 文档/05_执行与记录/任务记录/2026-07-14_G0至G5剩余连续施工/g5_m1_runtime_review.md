---
doc_id: AIR-G05-G5-M1-RUNTIME-001
status: completed
created: 2026-07-15
updated: 2026-07-15
owner: AI漫游项目
audience: runtime-reviewer, human, luna
source: G5-M1 实际 PNG/PDF/切片、性能与失败隔离结果
---

# G5-M1 Runtime / Visual Review

## 结论

`passed_isolated`。

## 实际复核

- `corepack pnpm prototype:g5-e0` 最终退出码 `0`，结论为 candidate A available。
- A 的 `1800×2400` PNG 已打开：四画格、自由图片旋转/crop/flip、横排范围样式、竖排中日混排与四类气泡均可见，正式 scene 不含状态标签或编辑器辅助 UI。
- 单页 PDF 已用 `pdfinfo` 验证为 1 页、`1350×1800pt`、PDF 1.4，并用 Poppler 渲染为 PNG 人工查看；内容与正式 PNG 语义一致，无空页、裁切错位或系统字体依赖。
- 40 页能力 PDF 为 40 页且全部 MediaBox 相同；5 个条漫切片可解码，首片已人工打开，尺寸为 `1080×8192`。
- PNG 三次 sha、PDF 三次规范化 sha、黄金图 sha 与条漫 source/slice 像素摘要均一致。
- 性能实测 p95=`19.9ms`、pointerup=`0.2ms`，通过 `32ms/100ms` 门。
- B 在第一个 `1080×8192` resvg 切片稳定失败；总 runner 未崩，失败证据可追溯。

## 不适用项

M1 是隔离技术路线原型，不执行正式数据库、持久 worker、真实编辑器路由或用户 publication；这些由 M2～M8 连续关闭。
