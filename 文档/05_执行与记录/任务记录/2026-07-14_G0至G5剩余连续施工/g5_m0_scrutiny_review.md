---
doc_id: AIR-G05-G5-M0-SCRUTINY-001
status: completed
created: 2026-07-15
updated: 2026-07-15
owner: AI漫游项目
audience: scrutiny-reviewer, human, luna
source: G5-M0 代码、fixture、契约与测试证据
---

# G5-M0 Scrutiny Review

## 结论

`passed`。

## 复核结果

- 8 个正式要求的 fixture 文件均存在，根文档使用 `layout_document_v1`，页漫/条漫 profile 与 canvas kind 匹配。
- corpus 保存 document、source lock set、publication profile、asset manifest 与 RenderPlan known-answer digest；测试使用 Shared JCS/SHA-256 重新计算，不信任生成器自报值。
- 图片字节由本地确定性生成器创建，Inter WOFF2 在复制前核对固定 sha；测试不访问网络、用户 workspace 或真实 secret。
- 20 canvas/200 element 性能规模已固定；四条 E2E vertical-slice 名称、route、owner milestone 均显式登记。
- PNG/PDF/slice、浏览器文字语义与 CJK 字体没有伪造为绿色；M0 只留下结构化红灯。
- 旧 file-mode export 的逐字节复制由运行测试证明；M0 没有删除旧路径，符合“新 renderer green 后才 cutover”的契约顺序。
- 代码提交只包含 M0 文件；工作树中的既有 R0/R2/M6 文档改动未暂存、未修改、未清理。

## 残留项

- Inter fixture 的正式 cmap/浏览器字体隔离和中日文字体许可审计由 M1 E0 实测；M0 不能据此通过 `G5-FONT-*`。
- `test:render`、`test:migration:g5`、`test:e2e:g5` 当前按设计非零；只有对应真实功能关闭后才能转绿。
