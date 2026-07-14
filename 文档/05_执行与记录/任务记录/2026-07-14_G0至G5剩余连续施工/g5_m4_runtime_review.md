---
doc_id: AIR-G05-M4-RUNTIME-001
status: passed
created: 2026-07-15
updated: 2026-07-15
owner: AI漫游项目
audience: runtime-reviewer, developer, qa, ai-agent
source: 提交 93a58b2 的 fresh SQLite、DB-only 浏览器路径与全量回归
---

# G5-M4 Runtime/User Review

## 结论

`passed`。当前 G4 定稿来源、画格/自由图、模板、裁切、阅读顺序、条漫分段重排与 DB-only 保存已形成真实用户闭环；M4 可以关闭并进入 M5。

## 真实页面路径

- fresh SQLite 通过真实 G4 路径建立 current CandidateLockRevision 并完成候选图；source catalog 返回的 lock revision 与 Shot current pointer 精确一致。
- 页面创建数据库草稿后显示 Shot tray 和 7 类模板；执行“按镜头排版”、左右双格、水平翻转，裁切显示“覆盖完整”。
- 画格图片可 detach 成 FreeImage，再通过“放入空画格”原子 attach；新增自由图后 Shot tray 的可见放置从 1 变为 2。
- 第二画格前移后，数据库中的 `panelReadingOrder` 与界面一致；新增条漫段落并前移后，数据库 canvas 顺序与界面一致。
- autosave 后 Working Copy rowVersion 前进，保存文档含 2 个画格、1 个 FreeImage 和 2 个条漫段；源 Candidate Asset sha 前后不变。
- 页面 `pageerror=0`；证据截图为 `evidence/g5_m4_layout_editor.png`。

## 自动化门禁

- Shared：17 files / 91 tests；Server：85 files / 546 tests。
- E2E 环境合同：33/33；默认 file 4/4、DB 4/4；M4 定向 DB-only 1/1。
- G5 fixture：3/3；全仓 typecheck、E2E typecheck、build、Prisma validate、G1 manifest/schema/migration 与 diff check 通过。
- `test:render`、`test:migration:g5`、`test:e2e:g5` 继续按阶段输出 machine-readable 红灯，owner 分别为 M5/M7、M8 和 M3～M8；未伪造成绿色。

## 隔离与副作用

运行使用受标记临时根、fresh SQLite、loopback fake provider 和隔离 Chromium。没有删除 backup/archive，没有执行 down migration，没有 file-only 回退，没有进入 G6/视频，没有 push。
