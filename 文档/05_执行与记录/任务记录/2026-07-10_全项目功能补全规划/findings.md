---
doc_id: AIR-TASK-20260710-FEATURE-GAP-FINDINGS
status: in_progress
created: 2026-07-10
updated: 2026-07-10
owner: AI漫游项目
audience: human, ai-agent, developer
source: task_plan.md
---

# 发现与决策

## 需求

- 用户希望重新调研并思考全项目还缺哪些功能，把热门平台和优秀提示词方法取长补短地融入 AI漫游。
- 先讨论和决策，允许先写 HTML；文档完善后才开始开发。

## 事实源

| 文档/文件 | 结论 |
| --- | --- |
| `文档/00_索引/AI上下文入口.md` | 当前产品主线为按章节推进的七步漫画生产流水线，轻漫剧后置。 |
| `文档/记忆/MEMORY.md` | 主链路后半段已形成候选图、锁定、基础排版、素材包闭环；PDF/ZIP、多格成稿、气泡、局部修图等仍是已知缺口。 |
| `git status --short --branch` | 候选图相关业务改动已在本会话期间进入 `118e3c7`；本轮新增内容仅为研究、决策与会话文档。 |

## 研究发现

- 既有竞品报告不是最终排期事实源：部分旧缺口已经实现，部分竞品判断已在复核版中被纠正。
- 本轮必须区分四种成熟度证据：文档目标、代码存在、自动化测试通过、真实用户路径可用。
- “提示词借鉴”至少包含四类不同对象：业务协作 agent 指令、技能流程、结构化输出契约、图片/视频模型 prompt；不能用同一套优化方法处理。
- 当前能力呈现三层成熟度：前半段工作台基本可用；候选图已有真实生成与锁定但真实质量门未闭合；排版、合成与可下载交付仍是骨架。
- 真实 Grok 样例已解决整页/多格/气泡污染方向，但仍会继承场景参考图中的人物和伪文字；问题已从“补 negative prompt”转为“场景素材资格、纯环境图版本与多参考图输入治理”。
- `LayoutExportService` 仍以一镜一页组织布局，导出通过复制第一个 placement 的候选图完成，不是真正的合成渲染。
- `AssetPackageService` 只生成目录和 manifest，未提供用户可下载的 ZIP。
- 通用任务存放在进程内 `Map`；取消不终止已发出的供应商请求，重试没有形成可恢复 attempt；只有图像生成注册了真实通用 worker。
- Prisma schema 可验证但没有接管当前主业务数据；正式状态仍以工作区 JSON 为主，任务状态另有内存存储。
- 真实样例项目出现 `project=draft`、章节已到 `storyboard_done`、镜头已到 `image_generated`、工作流处在候选图的状态漂移。
- 产品/UI/模块文档仍有旧结论，例如把候选图和锁定描述为未实现，必须在详细方案阶段同步校准。
- D1 对应字段不是新需求空白：`ComicFormat` 已有 `vertical_scroll/page_horizontal/four_panel`，但创建弹窗不展示、后端缺省为 `vertical_scroll`、剧本步骤仍允许修改，均与用户新决策冲突。
- `four_panel` 与另外两项不在同一分类轴：条漫/页漫是阅读容器，四格是布局模板。Clip Studio 等工具也把 Webtoon/Comic 项目类型与 Template 分开。
- 当前 `comicFormat` 还直接决定候选图默认请求比例；高自由画布需要后续把项目形态与镜头/画格目标比例解耦。
- 当前实际 workspace 只有一个项目，已经显式保存 `vertical_scroll`，D1 数据迁移没有实际缺失值，但仍需为通用旧数据设计异常报告。
- 用户确认 D1 入口位于现有创建项目弹窗，并提出字段显示名“漫画分格”。仓库中“画格/格子/分格”稳定指向 `Shot.comic`、`PanelPlacement` 和三/四格布局，因此推荐 UI 使用“漫画版式”，避免把项目级条漫/页漫与画布分格混成同一术语。
- D3 当前代码只有真实“锁定”动作，`selected` 只是枚举；重新锁定会直接改 `Shot.lockedCandidateId`，不会使已存在的 `PanelPlacement.candidateId` 失效，排版草稿可能继续引用旧 A 图。导出后章节变成 `layout_done`，锁定接口又会拒绝返修，当前缺少完整的换图修订路径。
- D2 A 不是新功能空白：共享契约已有 7 个 `PROJECT_WORKFLOW_STEP_KEYS` 和章节状态链；前后端均按状态推导 `done/active/waiting`，顶部步骤栏只允许进入 `done/active`；剧本完成、结构确认、分镜确认、出图准备确认、候选全锁后完成、排版导出和素材包导出均由用户动作推进。
- 当前真实 workspace 已完成剧本、剧情结构、分镜和出图准备，`workflow.currentStepKey=image_candidates`；第 1 章有 15 个镜头、27 张已生成候选、0 张锁定，因此真实样例尚未进入排版与素材包。这说明“阶段确认框架已实现”和“真实样例尚未走完整链路”同时成立。
- 当前没有覆盖 `draft -> exported` 七阶段完整用户路径的自动化 E2E；已有测试覆盖状态映射和候选生成契约。排版仍是一镜一页复制源图，素材包仍是目录 + manifest，所以后续应补真实能力与全链验收，不应重建阶段框架。

## 外部复核

| 主题 | 一手资料 | 关键结论 |
| --- | --- | --- |
| 直接漫画成稿 | Dashtoon、LlamaGen、Anifusion 官方页面 | 生成后的结构化排版、气泡文字、发布预览与导出已是直接漫画产品基线；无限画布不是完成漫画的必要前提。 |
| 生产系统邻居 | Jellyfish、LocalMiniDrama、LumenX 官方仓库 | 实体资产、shot preparation、关键帧、持久任务、取消/恢复和工程导入导出比单独的一键按钮更值得吸收。 |
| 图像模型 | OpenAI Image、Runway Gen-4 官方文档 | 不同模型对参考图、mask、negative prompt 和构图控制的能力不同，必须使用供应商 profile，不能套用万能模板。 |
| Prompt 工程 | Promptfoo 官方文档 | 固定测试样例、矩阵对比、结构化评分和持续反馈比继续收集热门 prompt 更可复现。 |
| D1 主流形态 | 看漫画、快看、Tapas、Clip Studio、Amazon KDP 官方资料 | 市场顶层形态可以收敛为竖向条漫和固定分页；四格更适合作为布局模板；项目形态适合在新建入口选择。 |

重要链接：

- https://github.com/Forget-C/Jellyfish
- https://github.com/xuanyustudio/LocalMiniDrama
- https://github.com/alibaba/lumenx
- https://llamagen.ai/releases
- https://anifusion.ai/all-features/
- https://developers.openai.com/api/docs/guides/image-generation
- https://help.runwayml.com/hc/en-us/articles/35694045317139-Gen-4-Image-Prompting-Guide
- https://www.promptfoo.dev/docs/intro/
- https://www.kanman.com/about/409275.html
- https://www.kuaikanmanhua.com/webs/send/letter
- https://help.tapas.io/hc/en-us/articles/1260802028970-Series-Basics-How-to-publish-a-comic-episode-on-Tapas
- https://help.clip-studio.com/en-us/manual_en/210_file/Creating_a_New_Canvas.htm
- https://help.clip-studio.com/en-us/manual_en/540_comic/Webtoons.htm
- https://kdp.amazon.com/en_US/help/topic/G9GSTY4LTRT39D4Z

## 证据

| 路径/命令 | 结论 |
| --- | --- |
| `文档/04_方案与决策/2026-07-10_全功能竞品对照复核.md` | 已指出旧报告存在能力误判和过期缺口。 |
| `文档/04_方案与决策/2026-07-09_提示词外部借鉴优先级.html` | 已完成 27 个提示词资产的初步分类，仍需核验外部方法与项目目标是否匹配。 |
| `apps/web/src/components/workbench/`、`apps/server/src/projects/` | 七步工作区及后端业务服务均已有真实入口，不能只按页面名判断完成度。 |
| `corepack pnpm test` | shared 15 项、server 64 项测试通过；当前自动化主要覆盖领域与服务逻辑，缺少 Web 端和完整用户路径 E2E。 |
| `corepack pnpm -r typecheck` | 三个 workspace package 类型检查通过。 |
| `corepack pnpm prisma:validate` | Prisma schema 有效，但不代表已经接管运行时持久化。 |
| 浏览器检查决策页 | 默认宽度与约 320px 内容宽度均无横向溢出；四个视图、D1 选择交互有效；无控制台 warning/error。 |

## 缺口与风险

| 风险 | 影响 | 建议 |
| --- | --- | --- |
| 把竞品功能并集当产品路线 | 范围膨胀、失去差异化 | 以用户交付任务和生产瓶颈为主轴评分。 |
| 旧报告与当前实现不同步 | 重复开发或错误排序 | 每项结论都回查代码与当前文档。 |
| 只看宣传页 | 能力、限制和商业条件误判 | 优先官方文档、官方仓库、帮助中心与可复现页面。 |
| 把 prompt 文案优化当系统质量 | 难以复现、不可追溯 | 同时设计输入事实、输出 schema、评测集、版本和回退。 |
| 过早写详细开发文档 | 用户方向变化导致返工 | 先完成依赖性最高的产品决策。 |
| 过早全量数据库迁移 | 发布闭环被基础设施改造拖住 | 先持久化任务与状态账本；全量 Prisma 化由规模和多用户目标另行决策。 |
| 轻漫剧与静态漫画同时成为主线 | 任务、视频、音频、时间线和静态成稿同时扩张 | 静态成品先闭环；视频只做架构验证，除非用户明确改为视频优先。 |

## 技术决策

| 决策 | 依据 |
| --- | --- |
| 暂不做功能代码改动 | 用户明确要求文档完善后开发。 |
| 新建独立复杂任务记录 | 任务跨全产品、架构、提示词资产、竞品研究和多阶段决策。 |
| 推荐用三条轨道组织缺口 | 静态发布闭环、生产可靠性、AI 质量系统分别解决用户产物、运行稳定和生成可控性。 |
| 将旧 prompt 优先级改为 Q0–Q5 | 服务端生成规格已统一，当前缺口是样例、审计、供应商 profile 与回归质量门。 |
| D1 复用并收紧现有 `comicFormat` | 避免 `ProjectType/workType/comicFormat` 多个重叠字段；创建后不可变由 UI、DTO、服务和数据库共同保证。 |
| D1 已确认只保留竖向条漫/分页漫画 | 这是主流阅读容器分类；四格降为可变模板，发布平台规则降为可版本化 ExportProfile。 |
| D1 已确认字段显示名“漫画版式” | “漫画分格”保留给画布格子和布局模板；项目字段表达条漫/页漫阅读结构。 |
| AI 质量与提示词工程独立建项 | 用户确认其重要性，不再把它作为普通 Prompt 文案优化 TODO。 |
| D3 已确认从二态问题升级为修订式替换 | 收藏不驱动下游；更换定稿图建立新修订并标记受影响布局/导出，而不是静默改指针。 |
| D3 取消定稿也必须留修订 | 用 `action=clear` 保留完整决策时间线；source/impact digest 由排序后的规范 JSON 计算，避免跨进程和数据库顺序差异。 |

## 复核发现

### Scrutiny Review

- 研究基线明确区分文档目标、代码存在、自动验证和用户路径，没有把类型或 UI 骨架算作完成。
- 外部结论均限定为公开能力或官方仓库声明，不推断对方内部稳定性与商业效果。
- 路线图保留首发格式、自动化姿态、候选状态、气泡边界、视频时机和持久化演进等用户决策，没有提前固化为开发范围。
- 决策 HTML 与 Markdown 基线的成熟度、优先级和 D1 推荐一致。
- D1 方案没有新造重叠的项目类型字段，而是复用现有 `comicFormat`；同时识别了 `four_panel` 分类轴错误、`page_horizontal` 命名过窄和候选图比例耦合。
- D1 已覆盖并确认创建入口、术语、顶层枚举、不可变规则、数据库字段、旧值迁移、下游显示、验收和回滚风险。
- D7 只作为已确认方向和 D1 数据依赖记录，没有在本轮越界写全量数据库方案。
- 术语复核不通过“漫画分格”作为 D1 字段名：它与现有画格/格子/分格领域语言冲突；建议“漫画版式”。
- D3 用户反例成立，当前代码在排版草稿存在时更换锁定候选会造成当前锁定与 placement 来源分叉，不能沿用“只改 lockedCandidateId”的方案。
- D3 已确认以 `CandidateLockRevision + LayoutRevision freshness + ExportRevision + task source digest` 解决返修与旧任务污染问题；正式记录为 ADR-0010。

### Runtime/User Review

- 浏览器已验证四视图切换、能力选择、D1 方案选择和窄屏无横向溢出。
- 用户已确认 D1 和 D3；决策页已显示两项正式结论并默认聚焦下一项 D4。
- D2 A 已复核为现有实现，不需要另写“人工工作台”功能方案；D4/D5/D7 已形成正式方案，D6、R5 与 D2 自动调度细节后置。

## 遇到的问题

| 问题 | 解决方案 |
| --- | --- |
| 长期记忆内容密集且部分结论按时间演进 | 以日期较新的正式文档和真实代码为准，旧结论只作历史背景。 |
| `file://` 页面被浏览器安全策略阻止 | 使用只绑定 `127.0.0.1` 的临时只读 HTTP 服务完成本地视觉检查，检查后立即关闭。 |
