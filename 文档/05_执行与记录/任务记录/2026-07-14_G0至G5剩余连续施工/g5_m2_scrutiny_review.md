---
doc_id: AIR-G05-M2-SCRUTINY-001
status: passed
created: 2026-07-15
updated: 2026-07-15
owner: AI漫游项目
audience: reviewer, developer, qa, ai-agent
source: G5 契约、提交 e93d70f、固定语料与测试证据
---

# G5-M2 Scrutiny Review

## 结论

`passed`。提交 `e93d70f` 满足 G5-M2 Shared Layout Domain Kernel 退出条件，可以进入 G5-M3。

## 静态复核

| 关注点 | 结论 | 证据 |
| --- | --- | --- |
| 文档边界 | 通过 | LayoutDocument/Profile/Element/RichText/Publication 均有 strict codec；未知字段与 viewport/dpr 等私有状态拒绝 |
| 规范化与摘要 | 通过 | 0.001 量化、rotation、颜色、NFC/换行/run 合并、JCS/SHA-256；8 fixture digest 不变 |
| 来源事实 | 通过 | 固定遍历投影；G4 Shot/LockRevision digest；提供 Asset sha/尺寸时重算 sourceDigest 与 crop coverage |
| 命令 | 通过 | 39 类 payload 编译期映射和 runtime strict codec；纯 reducer、snapshot inverse、batch atomicity、changed IDs 与预检 scope |
| Undo 限制 | 通过 | 200 batch / 50 MiB，按最早项确定淘汰；100 条命令逆序恢复原 digest |
| 几何与模板 | 通过 | 同一 cover 矩阵、7 preset、阅读顺序维护、occupied panel 图片禁止静默丢失 |
| 文字与气泡 | 通过 | `unicode_17_0_uax29_rev47`；emoji/组合字符/Indic；四类固定气泡路径 |
| 依赖边界 | 通过 | 生产 Layout 模块无 DOM、DB、文件、Konva 或宿主 Intl；唯一新增依赖 `unicode-segmenter@0.17.0`，MIT、零 runtime 依赖 |

## 未发现问题

未发现阻止 M3 的 correctness、契约、许可或依赖问题。

## 后续不变量

- 没有受控 Asset 尺寸/sha 上下文时，codec 只做文档结构校验；M3/M4 Server 保存必须传真实 Asset 上下文，不能把“未校验”解释为 crop/source 已通过。
- snapshot inverse 只属于浏览器会话 history，不写 LayoutDocument 或数据库。
- Font provision/glyph/embedding 仍由 M5 关闭，正式 renderer/browser semantics 仍由 M7 关闭；`test:render` 保持真实红灯。
- M2 没有数据库、页面或用户路径，因此不声称 Working Copy、编辑器和正式出版已经完成。
