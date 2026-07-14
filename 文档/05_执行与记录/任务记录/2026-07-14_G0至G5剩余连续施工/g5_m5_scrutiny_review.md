---
doc_id: AIR-G05-M5-SCRUTINY-001
status: passed
created: 2026-07-15
updated: 2026-07-15
owner: AI漫游项目
audience: reviewer, developer, qa, ai-agent
source: G5 契约、提交 cd35053、字体证据与 M5 自动化
---

# G5-M5 Scrutiny Review

## 结论

`passed`。提交 `cd35053` 关闭 M5 的受控字体、横竖排富文本、IME/paste/overflow、四类气泡和单尾巴退出条件，可以连续进入 G5-M6。PDF 字体嵌入仍由 M7 验收，不计入 M5 通过项。

## 静态复核

| 关注点 | 结论 | 证据 |
| --- | --- | --- |
| 字体来源 | 通过 | 依赖版本、400/700 字节 sha、cmap、weight/style、OFL-1.1 与 embedding 元数据固定；运行时无下载 |
| Asset 生命周期 | 通过 | staged→`asset.promote` Outbox→ready；文件先临时写入再提升，DB/JSON 不保存字体字节 |
| 字体一致性 | 通过 | catalog/file/save 三处复核 ready Asset、sha/bytes/cmap/face；Web 与 Server 使用同一 Asset bytes |
| 系统字体隔离 | 通过 | FontFace family 由完整 Asset ID 编码；不声明 local/system fallback，缺字不退系统 emoji |
| 富文本事实源 | 通过 | contenteditable 只是输入 adapter；保存内容仍是 RichTextDocument/Editor Command，不落 DOM/HTML |
| IME 与 paste | 通过 | composition start/end 合成一个命令；paste 只取 plain text，外部 HTML 不入文档 |
| grapheme 与范围样式 | 通过 | Unicode 17 grapheme offset 映射；字体、字号、粗斜体、颜色、描边、字距按范围作为一次可撤销命令 |
| 横竖排与 overflow | 通过 | horizontal-tb/vertical-rl、mixed/upright 使用正式字段；改容器只重排，不缩字号；overflow 返回精确定位 |
| 气泡 | 通过 | speech/thought/shout/caption 使用 Shared 固定路径；最多单尾巴，root/target/baseWidth 可调；文字模式与对象移动模式分离 |
| 阶段边界 | 通过 | M5 不创建 LayoutRevision、renderer、Publication、legacy migration 或 AI pending；正式导出按钮仍被门禁 |

## 复核中关闭的问题

- 外部 paste 后浏览器保留旧 contenteditable span，导致后续范围选择与模型偏离；渲染 key 已绑定完整富文本模型，外部突变后强制按事实源重建 DOM。
- 小气泡一度允许高度小于上下 padding，用户会得到无意义负内容区；UI 现与 Shared 一致拒绝该尺寸，合法小气泡仍可显示明确 overflow。
- 初版 FontFace family 只截取 Asset ID 后缀，理论上存在碰撞；现对完整 ID 的字符编码生成 family。
- M4 E2E 原先手工 seed 假 FontAsset；改为走生产 provision，确保既有画格路径也验证新字体前置，不保留测试专用后门。

## 后续不变量

- M6 的 Revision/preflight 必须复用 M5 的字体、缺字、embedding 和 overflow 问题模型，不得另算一套宽松规则。
- M6 保存正式 Revision 前仍需来源 current、字体 ready 和所有 error 级预检通过；warning 只允许显式确认。
- M7 renderer 只能读取不可变 Revision 与同一 FontAsset bytes，PDF 嵌入/子集化须以真实文件验收。
