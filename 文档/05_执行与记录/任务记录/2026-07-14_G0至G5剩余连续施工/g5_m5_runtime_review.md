---
doc_id: AIR-G05-M5-RUNTIME-001
status: passed
created: 2026-07-15
updated: 2026-07-15
owner: AI漫游项目
audience: runtime-reviewer, developer, qa, ai-agent
source: 提交 cd35053 的 fresh SQLite、DB-only 浏览器路径与全量回归
---

# G5-M5 Runtime/User Review

## 结论

`passed`。受控字体、IME 富文本、纵排文字、四类气泡、模式隔离、溢出提示和 DB-only 恢复已形成真实用户闭环；M5 可以关闭并进入 M6。

## 真实页面路径

- fresh SQLite 通过真实 G4 路径准备 current CandidateLockRevision，再由 Working Copy 初始化自动 provision 两张生产字体 Asset。
- 浏览器从 verified file API 成功加载 400/700 WOFF2；computed canvas family 以 `AIR_` 开头，不包含 Arial、Helvetica、Times 或 system-ui。
- 中文 IME composition 只增加一个 Undo step，Undo/Redo 可完整恢复；粘贴含 HTML 的外部内容后只保留纯文本。
- 对 grapheme 选区一次应用粗体、斜体、72px、颜色、描边和字距，一次 Undo 完整撤销；随后切换为 vertical-rl/mixed。
- 页面生成 speech/thought/shout/caption 四种不同 SVG 路径并调整单尾巴；文字模式拖拽不移动气泡，选择模式拖拽移动完整复合对象。
- 合法小气泡配长文本后出现红色“文字溢出”与精确问题；正式版本/导出按钮继续禁用。
- autosave 后数据库中的 LayoutDocument 保留富文本、纵排、气泡类型与 tail；两张字体 Asset 为 ready、两条 promotion Outbox 为 processed，未发现 base64 字体字节。
- 页面 `pageerror=[]`；截图为 `evidence/g5_m5_text_balloon_fonts.png`。

## 自动化门禁

- Shared：18 files / 96 tests；Server：86 files / 549 tests。
- 全仓 typecheck、E2E typecheck、build、Prisma validate 与 diff check 通过。
- E2E 环境合同 33/33；file 4/4；DB 5/5（含 M4 与 M5 同场回归）。
- M5 定向 DB-only 连续复跑 3/3；fixture 3/3。
- `test:render` 按设计非零，但只剩 M7 的 `G5_PRODUCTION_RENDERER_NOT_IMPLEMENTED` 与 `G5_PRODUCTION_BROWSER_SEMANTICS_NOT_IMPLEMENTED`；M5 字体红灯已移除。

## 隔离与副作用

运行使用受标记临时根、fresh SQLite、loopback fake provider 和隔离 Chromium。没有删除 backup/archive，没有执行 down migration，没有 file-only 回退，没有进入 G6/视频，没有 push。
