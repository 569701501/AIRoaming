# G5 Layout fixture corpus

本目录是 G5-M0 的固定、无网络、无真实密钥测试语料。运行 `pnpm g5:fixtures:generate` 可从仓库内确定性生成 8 份 LayoutDocument fixture、3 张 PNG 和摘要清单。

- `corpus.manifest.json` 固定 document/source/profile/RenderPlan known-answer digest。
- `assets/inter-latin-400.woff2` 来自锁定的 `prisma@6.19.3` 安装产物，生成器先核对固定 sha256；字体许可证标识为 `OFL-1.1`。
- 中日文字体、浏览器语义快照和 PNG/PDF/slice 产物在 M0 明确为红灯，必须由 G5-M1 的技术原型与许可证审计补齐，不能填写虚构 sha。
- 所有图片由生成器本地生成，测试不得读取外部 URL 或用户 workspace。

更新语料必须运行生成器和 fixture contract test，并人工确认 `corpusDigest` 变化原因。正式 renderer golden 不允许无条件覆盖。
