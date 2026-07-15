---
doc_id: AIR-G05-M7-RUNTIME-001
status: passed
created: 2026-07-15
updated: 2026-07-15
owner: AI漫游项目
audience: runtime-reviewer, developer, qa, ai-agent
source: 提交 d8ed6cc 的 fixed renderer、fresh SQLite、DB-only 浏览器路径与全量回归
---

# G5-M7 Runtime/User Review

## 结论

`passed`。真实页面已从当前不可变版本运行导出预检、提交持久任务、等待后台渲染、看到“当前成品”，并通过 scoped API 读取实际 PNG；DB 中 publication/task/current pointer/3 个 ready Artifact 一致。固定 renderer 的真实 PNG、PDF、20 段切片和 CJK 嵌入证据同时通过，M7 可以关闭并进入 M8。

## 真实页面路径

- fresh SQLite 经真实 G4 current lock 建立 DB Working Copy 与 sealed LayoutRevision。
- “正式出版”复用 M6 export preflight；无 blocker 且 warning 已确认后才创建 `layout_export`。
- 页面观察 publication 从 queued→rendering→ready，最终显示“出版 1 · 已完成 / 当前成品”。
- Artifact 导航显示“条漫切片 1 / 长图 / 清单”；切片 HTTP 返回 `200 image/png` 且 PNG magic 正确。
- DB 复核 ExportRevision=`ready/current`、GenerationTask=`layout_export/succeeded/current`、3 个 ExportArtifact 对应 ready Asset，Chapter current 指针等于本 publication。
- 页面 `pageerror=[]`；截图为 `evidence/g5_m7_publication_ready.png`。

## 固定输出证据

| 产物 | 结果 |
| --- | --- |
| page PNG | 1800×2400，126121 bytes，三次 sha=`sha256:e0eba32453f52d6e6a4754a8e683ecbe4185c5af9be07b276197327f2b10b4f8` |
| document PDF | 1 页，5301 bytes，三次 sha=`sha256:5afe9ca23349892ef33021bb6cbd6188db217a36da4b1a7fed3d4bfd05359364` |
| vertical slices | 20×1920 source → 5×1080×7680；每片可解码，切点为 0/7680/15360/23040/30720/38400 |
| CJK PDF | 固定 Noto Sans SC 400 WOFF2；PDF 含嵌入 Type3 subset、CharProcs、ToUnicode；无本地路径/字体文件名 |

## 自动化门禁

- `test:render`=`green`：fixture 3/3、Shared publication 4/4、renderer 3/3、DB publication recovery 1/1。
- Shared 全量 22 files / 108 tests；Server 全量 89 files / 555 tests。
- M7 DB-only Playwright 1/1；E2E 环境合同 33/33；全仓 typecheck、E2E typecheck、build、Prisma validate、G1 manifest check 与 diff check 通过。
- 0015 migration shape/runtime 1/1；完整 P6/G4-D/M6/M7 集成覆盖丢失 promotion 后 staged recovery、取消、迟到 historical 和 scoped file read。
- `test:migration:g5` 仍只保留 owner=M8 的 `G5_LEGACY_LAYOUT_MIGRATION_NOT_IMPLEMENTED`，是明确下一阶段红灯。

## 隔离与副作用

运行使用受标记临时根、fresh SQLite、loopback fake provider 和经校验的固定 Chromium。没有删除 backup/archive，没有执行 down migration，没有 file-only 回退，没有进入 G6/视频，没有 push。
