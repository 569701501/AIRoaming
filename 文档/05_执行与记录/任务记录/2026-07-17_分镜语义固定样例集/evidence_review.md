---
doc_id: AIR-TASK-20260717-STORYBOARD-SEMANTIC-CORPUS-EVIDENCE
status: completed
created: 2026-07-17
updated: 2026-07-17
owner: AI漫游项目
audience: human, ai-agent, developer, qa
source: 固定样例、自动测试与真实 self/gpt-5.5 运行报告
---

# 分镜语义固定样例集证据复核

## 样例证据

- 固定文件：`tests/fixtures/storyboard-semantic/corpus.json`
- SHA-256：`97ff5d0d50939a650f62d2ef11c904ebd4c570f83929ad9e1f97e4a35b49fad2`
- 共 5 个题材、14 个 Beat、28 个语义维度。
- Beat 密度为 2、3、4 三档。
- 人工预期覆盖 `covered`、`partial`、`missing`、`contradicted` 四态，并包含 `pass / warning / fail` 三类本地总状态。

## 真实文本模型证据

### 全集两轮

- 报告：`corpus-model-report.json`
- SHA-256：`38261ebb1a4de29f384cad096bbb2b083d02f8ec75a2a149154542f9afa3c5f1`
- 模型：`self/gpt-5.5`
- 执行：10/10。
- 严格契约成功：9/10。
- 人工预期一致：51/52，98.1%。
- 重复可比较维度稳定：23/24，95.8%。

| 样例 | 有效运行 | 预期一致 | 重复稳定 | 备注 |
| --- | ---: | ---: | ---: | --- |
| 声音触发悬疑 | 2/2 | 8/8 | 4/4 | 稳定识别声音因果缺失 |
| 屏幕身份罪案 | 2/2 | 12/12 | 6/6 | 稳定区分胸牌与具体身份 |
| 家庭对白选择 | 2/2 | 16/16 | 8/8 | 全完整正对照稳定 |
| 动作追逐反转 | 1/2 | 4/4 | 不适用 | 1 次契约失败 |
| 克制情感和解 | 2/2 | 11/12 | 5/6 | 关系状态一项边缘分歧 |

### 动作样例定向重试

- 报告：`action-retry-model-report.json`
- SHA-256：`e8ed21cb1694d9541fbf1ff4ae3bac21dcdae5f3412da97856624818afd60417`
- 有效运行：2/2。
- 人工预期一致：8/8，100%。
- 重复稳定：4/4，100%。
- 首轮契约失败未复现，因此按模型单次格式波动记录，不把失败样例删除或改成更容易通过的内容。

## 确定性验证

| 验证 | 结果 |
| --- | --- |
| 语义评测 + corpus 定向测试 | 14/14 通过 |
| corpus dry-run | 5 个样例、repeat=2，Prompt 字符数 2309/3129/4206/2306/3221 |
| Server 类型检查 | 通过 |
| Server 构建 | 通过 |
| `git diff --check` | 通过 |
| Server 全量测试 | 两次均 706/707；同一无关备份用例在全仓并发下 5005/5007ms 超过固定 5000ms |
| 超时用例单独重跑 | 1/1 通过，2389ms |
| 完整备份测试文件单独重跑 | 40/40 通过；该用例 2050ms |

全量唯一失败文件为 `src/backup/app-backup-restore.integration.spec.ts`，与分镜语义模块无引用关系；隔离与整文件运行均通过，归类为仓库已知并发测试稳定性债。本任务没有修改该测试或放宽超时。

## 范围证明

- 新代码只被测试和 `storyboard:semantic:corpus` package script 调用。
- 未修改生产分镜 Prompt、StoryStructure、Storyboard、DTO、数据库、页面或确认流程。
- 真实运行只使用文本模型；图片、视频、TTS、字幕和其他媒体服务调用为 0。
- 未创建或修改业务项目、章节、分镜版本或媒体任务。
