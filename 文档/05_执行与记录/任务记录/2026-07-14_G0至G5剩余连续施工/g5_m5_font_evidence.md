---
doc_id: AIR-G05-M5-FONT-EVIDENCE-001
status: passed
created: 2026-07-15
updated: 2026-07-15
owner: AI漫游项目
audience: reviewer, developer, qa, ai-agent
source: cd35053、生产字体字节、fontkit cmap 审计与 DB-only 集成测试
---

# G5-M5 受控字体证据

## 1. 固定来源

生产依赖固定为 `@openfonts/noto-sans-sc_chinese-simplified@1.44.9`，字体本体许可证为 OFL-1.1，许可证来源固定为 Noto CJK 官方仓库 `Sans/LICENSE`。运行时不下载字体，不读取客户端已安装字体。

| face | bytes | sha256 | 实际 weight/style |
| --- | ---: | --- | --- |
| 400 | 1,602,144 | `sha256:e1f8a59c19da8a5d97b7703d07ee2416e86cbc3b30fb20cb0d6fd30df43364ce` | 400 / normal |
| 700 | 1,662,964 | `sha256:989da46b79020196982ff943896843d69a8a16412a385b726b525dd626cf39f4` | 700 / normal |

两张 face 的 cmap 均为 7,898 个 code point、4,109 个规范 range，摘要均为 `sha256:f0aadbba133c9af21f940a346e61c5235bc9fe0197b7581b8ddfda5d48af19b3`。基础汉字、平假名、片假名可用；emoji 不在覆盖范围，预检必须报缺字，不能退回系统 emoji。

## 2. 数据与文件边界

- 项目 provision 先写 `Asset(type=font, role=layout_font, state=staged)`，再写 `asset.promote` Outbox；promotion 成功后才变为 `ready`。
- Asset 只保存 `storageKey/sha256/bytes/mimeType/metadataJson`；字体字节不写 base64、不写普通 JSON。
- catalog 返回前会再次读取文件并复核 bytes、sha、fontkit characterSet、cmap ranges、OS/2 weight 与 italic style。
- verified file API 返回的字节就是 catalog 指向的同一 ready Asset；missing、摘要不符、格式不支持或 metadata 不合法均返回稳定错误。
- project 重复 provision 幂等复用同一 face，不重复创建字体 Asset。

公开边界：

```text
GET  /projects/:projectId/chapters/:chapterId/layout/fonts
POST /projects/:projectId/chapters/:chapterId/layout/fonts/provision
GET  /projects/:projectId/chapters/:chapterId/layout/fonts/:assetId/file
```

## 3. 浏览器隔离

- Web 只从 verified file API 构造 `FontFace`；family 名由完整 Asset ID 字符编码生成，避免 ID 碰撞。
- 正式文字节点只声明该受控 family，不追加 Arial、Helvetica、Times、system-ui、local() 或其他系统 fallback。
- Working Copy 初始化前保证项目生产字体已 provision；保存时 Server 逐项验证 document 中的字体引用仍属于当前项目且处于 ready。
- embeddingAllowed=false、缺字体、缺 glyph 和文字 overflow 都进入同一个预检问题模型；当前正式版本/导出按钮继续禁用，M6/M7 将直接消费该模型。

## 4. 证据映射

- Shared：严格 metadata/catalog codec、cmap 查找、family 隔离、横/竖排 overflow、缺字与 embedding 门禁。
- Server：真实 temporary SQLite + Asset/Outbox/文件 promotion、幂等 provision、verified read、sha mismatch、保存字体引用门禁。
- Browser：真实 DB-only 页面确认两张字体文件加载成功，computed family 为 `AIR_...` 且无系统字体；数据库有两张 ready font Asset 和两条 processed promotion Outbox。
- PDF 字体嵌入与子集化不在 M5 伪造通过，继续由 M7 的真实 PDF 验收。
