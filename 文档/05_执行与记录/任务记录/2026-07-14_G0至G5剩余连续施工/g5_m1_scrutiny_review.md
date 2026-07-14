---
doc_id: AIR-G05-G5-M1-SCRUTINY-001
status: completed
created: 2026-07-15
updated: 2026-07-15
owner: AI漫游项目
audience: scrutiny-reviewer, human, luna
source: G5-M1 原型、ADR-0016、E0 机器报告与契约
---

# G5-M1 Scrutiny Review

## 结论

`passed`。

## 复核结果

- A/B 都是完整薄切片，不是只测拖拽；共享 M0 LayoutDocument/font/assets，覆盖四格、自由图、crop/flip/rotation、横竖排富文本、四类气泡、IME、历史命令、PDF 与条漫。
- A 的 15 个机器门全部为真；固定黄金 SHA 已在人工打开 PNG/PDF 后写入，并由下一次冷重跑命中。
- 条漫不是生成 38400 高单图：同一 RenderScene 按 8192 高 viewport clip；5 片像素流与 20 个 1920 高源段落摘要完全一致。
- B 的 8192 高 resvg native abort 被独立子进程隔离并稳定转为候选失败；没有因页面 PNG 可生成而忽略正式切片硬门。
- PDF 使用 pypdf 规范 metadata/ID；单页三次 sha 相同，40 页 MediaBox 全部相同，Type0/Type3 字体均自包含。
- cmap 审计直接读取 OTF/WOFF2 字节；缺 glyph 与缺字体均显式失败，渲染期外网请求为 0。
- 原型只写 marker 保护的 `.runtime/`，不连接数据库、provider、用户 workspace，不修改 backup/archive。
- ADR-0016 已记录版本、binary 获取、字体、许可证、失败路线与升级门禁；满足 `G5-E0-010`。

## 约束

- 原型标为归档证据，不得复制到生产页面。
- M2 必须用版本化 Shared 实现锁定 grapheme policy；原型 `Intl.Segmenter` 不得成为生产契约。
- 正式 renderer、持久任务和 publication 仍属于 M7，`test:render` 不能因 E0 通过提前伪绿。
