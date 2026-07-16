---
doc_id: AIR-TASK-20260716-STORY-STRUCTURE-REAL-MODEL-FINDINGS
status: completed
created: 2026-07-16
updated: 2026-07-16
owner: AI漫游项目
audience: human, ai-agent, developer, qa
source: 真实页面、真实模型输出、隔离数据库和代码契约
---

# 剧情结构真实模型验收发现

## 已知基线

- A+ 两条上游路线已经通过真实模型形成正式章节；本轮不重复评估全部 A1～A5、B1～B5。
- 剧情结构固定质量门的自动证据为 Server 107 files / 652 tests、类型/构建和 fake-provider 浏览器确认链通过。
- 质量门仅处理高置信完整性、来源和引用错误，不替代用户对节奏、人物弧和商业质量的判断。

## 环境边界

- 真实模型：`self/gpt-5.5`。
- 项目数据：独立 SQLite、独立 workspace、两个新项目。
- 现有应用：只检查端口归属，不读取或修改其项目内容。
- 隔离应用：Server `http://127.0.0.1:4328/api`，Web `http://127.0.0.1:5188/`；默认模型接口确认 `self/gpt-5.5`。
- 隔离 SQLite 初始化前需先存在空文件，否则本机 Prisma 只返回通用 Schema engine error；建空文件后 17 段 migration 正常完成。

## Scrutiny Review

- `PRAGMA integrity_check` 返回 `ok`。
- AI 创作：`currentScriptVersionId=c8643c58-ea0b-496d-be2b-904bc839b60b`，`StoryVersion.sourceScriptVersionId` 完全一致；StoryVersion `confirmed`，章节 `structured`。
- 已有剧本：`currentScriptVersionId=9f53cd70-df6a-4721-a192-e93f465d1aaa`，`StoryVersion.sourceScriptVersionId` 完全一致；StoryVersion `confirmed`，章节 `structured`。
- 导入批次 4 章均处理成功：第 1 章 `confirmed`，其余 3 章 `pending_ready`；没有批量确认或后台偷跑正式版本。
- 页面状态、数据库状态和对话工具结果一致；本轮没有产品代码改动，无需新增自动化回归。
- 结论：`passed`。

## Runtime/User Review

- AI 创作路线阶段结论：passed_real_model。
- 项目 `e3030488-a39b-402e-bbaf-80790ae69184`，章节“明天拾获的工牌”，正式正文 6446 字。
- 结构结果：3 characters / 7 scenes / 15 beats；`StoryVersion.sourceScriptVersionId` 与 `Chapter.currentScriptVersionId` 完全一致。
- 页面确认后章节 `structured`、分镜工作台可用、console error/warn=0。
- 采用 AI pending 后由用户点击“完成本章”发布，因此当前 `ChapterScriptVersion.origin=user`；AI 来源仍保留在章节 revision/thread/message/tool 记录，不应把 origin 强行写成 ai。
- 已有剧本路线阶段结论：passed_real_model。
- 项目 `25130835-99bb-4149-a6f0-3acdebe434b3`，目录一次确认后创建 4 个章节入口并由后台逐章整理、验证；第 1 章“第一场：灯塔值班室”确认成 1016 字正式版本，`origin=import`。
- 第 1 章结构结果：3 characters / 1 scene / 6 beats；`StoryVersion.sourceScriptVersionId` 与 `Chapter.currentScriptVersionId` 完全一致。
- 页面确认后第 1 章 `structured`、分镜工作台可用；第 2～4 章保持未确认，用户可自由切换查看全文。浏览器 console error/warn=0。

## 观察与边界

- 原稿使用“第一场～第四场”明确标记，模型据此提出 4 个章节候选。这是可见且需用户确认的目录判断，不是系统未经确认自动拆章。
- 导入章忠实整理中的“类型、主题、风格”等原稿未给信息保持“原稿未明确”；没有为了填满页面字段而擅自补写。
- 本轮证明的是两条来源在真实模型下能够通过固定高置信质量门并正确汇合，不等同于对所有题材、超长稿和商业艺术质量的穷尽评测。
