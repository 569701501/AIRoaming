---
doc_id: AIR-TASK-NOVEL-ASSET-FINDINGS-001
status: active
created: 2026-07-25
updated: 2026-07-25
owner: AI漫游项目
audience: human, ai-agent
source: 长篇原著资产库方案任务
---

# 已知事实

- 当前普通对话附件受 JSON 请求体、编码和模型上下文限制，不适合十几兆小说。
- 桌面两份小说合计约 29.2 MB、约 3842 个可靠内容单元。
- 用户倾向把“长篇拆章”放在项目外左侧导航，并把拆章结果作为可被创建项目选择的复用资产。

# 待核对

- 无。

# 代码事实

- 全局左侧导航已有“项目库 / 素材库 / 任务队列 / 设置”，新入口可放在项目库与素材库之间。
- 当前 `Asset` 和 `GenerationTask` 都强制属于项目；不能用隐藏项目承载全局原著，否则项目删除和备份生命周期会冲突。
- 当前 `ScriptRawSourceVersion/Document/Block` 同样强绑定 `projectId`，且会保存全文与大量段落块；不适合作为跨项目大原著资产。
- 创建项目固定创建一个默认制作章节；创建弹窗适合只增加一个可选来源引用，不适合放拆章设置或一次创建数千章节。

# 外部产品结论

- Novelcrafter 从首页导入小说、预览识别出的幕/章/场景，确认后直接创建项目并把全部章节填入 Plan 与手稿导航；系列间共享的是 Codex，不是整本原文。
- Sudowrite 的 `Import Novel` 会直接创建项目、自动拆成项目内独立章节文档并建立 Story Bible。
- Scrivener、Atticus 也把导入结果直接变成当前项目/书籍的章节树和目录。
- 因而小说创作产品的共同主流程是“导入小说 → 预览章节 → 直接创建或填充项目 → 在项目章节树中导航”，不是“全局原著资产 → 创建项目时绑定 → 逐章再次创建制作章节”。
- Dify 的工作空间知识库可被多个应用引用，但这是知识检索/RAG 产品模式；不应直接当作顺序型小说制作体验的主要依据。
- Novelcrafter 的系列级 Codex 与按需 AI 上下文，只能证明角色/世界观复用和不默认发送全部资料是合理原则。
- Gemini Notebook 证明大文件上传可被产品化，但 notebook 间隔离不适合一个原著供多个漫画项目使用。

# 原方案复核

```text
SourceWork（原著资产）
  └─ SourceWorkVersion（不可变版本）
       ├─ SourceDocument（原始字节、编码、规范 UTF-8 文件、摘要）
       └─ SourceChapter（顺序、标题、起止范围、摘要、异常）

ProjectSourceBinding（项目固定引用来源版本）
ChapterSourceBinding（制作章节引用一个或连续多个原著章节）
ChapterScriptVersion（真正进入漫画生产链的项目正式剧本）
```

- 该模型在存储、版本和来源追溯上成立，但把版本绑定、来源选择和制作快照都暴露给普通用户会造成过重心智。
- 尤其是“项目只展示已创建制作章节、每次再从原著挑选下一章”的交互，与成熟小说产品习惯不一致，应取消。

# 修正后的推荐

- “长篇拆章”仍作为项目外的大文件预处理入口：解决流式上传、GB18030、确定性拆章、异常预览和人工修正，默认 0 Token。
- 拆章确认页的主按钮是“基于此小说创建项目”；系统直接预填书名并创建项目，不要求用户再进入另一个创建弹窗寻找资产。
- 创建时把全部章节的标题、顺序和正文范围登记为项目内章节结构；首次打开第 1 章。
- 项目左侧采用可搜索、卷分组、虚拟滚动的章节树；用户直接点任意章，不使用数千项普通下拉，也不逐章执行“创建制作章节”。
- 章节正文只在打开当前章时按范围读取；AI 改编、分镜或摘要只处理当前章，全部章节可见不会增加模型 Token。
- 底层仍可保留来源文件与章节范围用于追溯和去重，但首版不向用户暴露“资产版本绑定 / 制作快照 / 跨项目复用”。
- 首版不做向量库、全书摘要、多原著混编、自动同步或全书逐章 AI 整理。

# 代入当前项目后的结论

结论：方案可以接入，而且正式 `ChapterScriptVersion` 之后的七步按章生产链大部分可以复用；但不能只增加一个左侧菜单，也不能直接调用当前整本导入批次。必须先建立“轻量章节目录 + 当前章读取”的规模边界。

## 可以直接复用

- `Chapter` 已允许空 Working Copy，并通过 `projectId + order/slug` 形成项目内一等工作单元；来源项目创建后可以登记章节壳。
- `Project.currentChapterId` 可以在章节登记完成后指向第 1 章。
- 现有对话、Script Working Copy、`ChapterScriptPending`、`ChapterScriptVersion`、Story、Storyboard、Preflight、候选图和 Layout 都已经按 `chapterId` 隔离。
- 现有 import pending 的完整只读预览和“确认章节”链可以继续承接单章 AI 整理结果。
- 对话线程不会因仅存在章节目录而自动创建，现有按 `projectId + stepKey + chapterId` 隔离方式符合按章 Token 边界。

## 不能直接沿用

- 对话附件使用浏览器 `File.text()` 读取全文并随 JSON 发送；十几兆文件会先遇到错误编码和请求体限制，必须新增流式或 multipart 上传入口。
- `buildScriptRawSourceSnapshotV1` 按空行拆 block；两份目标小说会产生约 26.5 万 block，不能作为大小说默认解析器。
- 当前 B3 `startImportBatch` 会创建全部章节和全部 `queued` item，B4 Worker 会持续领取到队列排空；每章至少调用 materialize、verify 两次，2446 章至少约 4892 次模型调用，违背 Token 目标。
- 当前 `ProjectRepository` 在启动、刷新和打开工作台时会加载全部项目、全部章节、全部剧本版本和各类下游读模型，并在内存中构造完整 `LocalProject`。
- `WorkbenchSnapshot` 每次都返回完整 `ChapterListItem[]`；图片任务运行时页面约每 1.8 秒刷新一次，不能反复携带数千条重章节 DTO。
- 剧本页直接 `v-for` 全部章节；剧情结构、分镜、出图准备、候选图、漫画成稿和素材包各自使用原生 `<select>`，数千项不可用。
- 现有创建事务明确只接受一个默认章节，不能直接传入含 2446 章的 `LocalProject`。
- 当前只有剧本路由把 `chapterId` 写入 URL；其他章节级步骤切章只改变内存投影，刷新后不能可靠恢复第 648 章一类位置。

## 推荐的内部边界

```text
SourceWork / SourceWorkVersion
  └─ SourceChapter（标题、顺序、UTF-8 文件范围、摘要、异常）
       ↓ 默认一对一且不暴露绑定操作
ProjectChapterSource
       ↓
Chapter（漫画生产工作单元）
  └─ ChapterScriptPending / ChapterScriptVersion
       └─ Story → Storyboard → Preflight → Candidate → Layout
```

- 用户只看到一本小说和一套章节目录，不操作来源版本和绑定关系。
- 从“长篇拆章”结果卡点击“创建漫画项目”或“再创建一个项目”，不在通用创建项目弹窗中寻找资产。
- 创建项目时登记全部轻量章节壳和来源绑定，设置第 1 章为当前章；不创建对话线程、AI 任务、pending、结构、分镜或排版。
- 打开未整理章节时先展示原文范围和“整理本章”主动作；仅用户主动开始时创建当前章的 materialize/verify 工作，AI 结果继续走现有 import pending 和逐章确认。
- 如果首轮实施不先完成当前 Repository/Workbench 的轻量读模型改造，则不得一次建立 2446 个现有 `Chapter`；临时替代只能是 `SourceChapter` 全目录、按需激活制作章，但这会引入双身份，不能作为长期默认架构。

## 必须先做的规模改造

1. 项目库改为数据库项目摘要与章节计数查询，不再为列表加载完整项目聚合。
2. 新增轻量章节目录接口，只返回 `id/order/title/volume/status/attention`；当前章节详情和下游数据单独查询。
3. 建立全工作区唯一的章节导航器，支持搜索、卷分组、直接跳章和虚拟滚动；移除七个页面各自的原生章节下拉。
4. 所有章节级步骤使用包含 `chapterId` 的统一路由，URL 成为当前章恢复事实源。
5. 新增长篇流式上传、编码识别、确定性拆章和异常确认；这些步骤为 0 Token。
6. 新增“从来源创建项目”事务和幂等键，批量写入章节与绑定后再设置 `currentChapterId`。
7. 将现有整批 import Worker 改为显式单章领取；禁止目录确认后自动扫描全书。
8. 全局原文件与规范化文件必须纳入备份、恢复、删除限制和摘要校验；不能复用强制属于项目的现有 `Asset` 冒充全局来源。

# Scrutiny Review

结论：**方案可行，但仅在先完成轻目录/当前章读模型和单章 AI 门禁后通过。**

阻断风险：

1. 直接复用现有全量 `LocalProject/WorkbenchSnapshot` 会导致重复大响应和页面渲染压力。
2. 直接唤醒现有 B4 Worker 会造成数千章自动 AI 调用。
3. 不增加统一章节路由会导致非剧本步骤刷新后丢失当前章节。
4. 全局来源文件若未进入备份和删除契约，会形成数据库可见但原文文件丢失的不可恢复状态。

本阶段没有功能代码，因此 Runtime/User Review 不适用；实施后必须用《凡人修仙传》前 20 章和全量 2446 章分别验证。
