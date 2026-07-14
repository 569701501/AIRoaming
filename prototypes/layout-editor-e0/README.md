# G5 E0 归档原型证据

> PROTOTYPE / ARCHIVED EVIDENCE - 不得直接复制进生产 Web/Server。正式路线见 ADR-0016。

问题：Konva adapter + DOM/Chromium 专用场景（A），与 SVG-native + 显式文字布局 + resvg（B），哪条路线能在同一 LayoutDocument/font/assets 上同时满足 round-trip、IME/Undo、浏览器与正式文字语义、三次 PNG/PDF 确定性、页漫/条漫输出和 20 canvas/200 element 性能门？

运行：

```bash
corepack pnpm prototype:g5-e0
```

原型只写 `prototypes/layout-editor-e0/.runtime/`，不连接数据库、不访问 provider、不读取用户 workspace。命令会在缺少字体时从 Noto 官方仓库下载固定路径文件，并在任何渲染前校验固定 SHA-256；渲染期间只允许访问回环地址。E0 已完成：A 通过全部硬门并被 ADR-0016 采纳；B 在 8192 高 resvg 切片发生已隔离的 native abort。此目录只保留为可复现归档证据。
