---
doc_id: AIR-TASK-20260712-G3-CONSTRUCTION-PACK-HANDOFF
status: ready
created: 2026-07-12
updated: 2026-07-12
owner: AI漫游项目
audience: luna, ai-agent, developer, qa
source: G3 五份施工资料与 Scrutiny Review
---

# Luna Handoff：G3-core

## 1. 当前状态

```text
implementation baseline commit: 96c8845
branch at documentation handoff: codex/g0-test-safety-net
G3 documentation: ready
G3 business code: not_started
allowed delivery: G3-core
blocked delivery: G3-M / G3 production-ready
```

开始实现前以实际收到施工资料的 commit 替换上面的文档工作区状态；不要假定未提交改动已包含在 `96c8845`。

## 2. 必读顺序

1. `文档/04_方案与决策/2026-07-12_G3施工包_依赖边界与阶段门禁.md`
2. `文档/04_方案与决策/2026-07-12_G3施工包_数据库Overlay与迁移账本.md`
3. `文档/04_方案与决策/2026-07-12_G3施工包_文件兼容与旧值迁移.md`
4. `文档/04_方案与决策/2026-07-12_G3施工包_API错误与Web状态契约.md`
5. `文档/06_测试与验收/G3施工包_下游适配与可执行证据.md`
6. G3 主方案、契约字典、原验收清单和 ADR-0009。

冲突优先级：ADR 产品决策 → 五份施工资料 → 旧主方案/字典 → 当前实现。发现事实冲突先停下并记录，不自行猜测。

## 3. 施工顺序

```text
G3-A0 Shared canonical
G3-A1 DB 0010/overlay/ledger（可与 A0 并行开发，但各自完整验证）
  -> G3-B0 Project input/API
    -> G3-B1 DB repository
    -> G3-B2 file compatibility/audit
      -> G3-C0 modal/store/error
      -> G3-C1 read-only display
      -> G3-D0 SourceSnapshot/Candidate/Task/Layout
        -> G3-E0 automated evidence + reviews
```

每次只领取一个切片，按施工资料的精确文件面和最小命令退出。不要用“按 G3 文档全部实现”作为单次任务。

## 4. 不可变裁决

1. canonical 只有 `vertical_scroll/paged_comic`。
2. HTTP/DB/新 artifact strict；`page_horizontal` 只在 file input adapter 只读投影且原文件不自动改写。
3. `four_panel/缺失/非法` fail-closed，不默认、不隐藏。
4. migration 固定 `0010_g3_comic_format_immutable`，只新增 `trg_g3_projects_comic_format_immutable`；同值 SET 也失败。
5. 最新 runtime guard 精确校验 0001～0010；不修改 0008/0009，不改 G1 manifest 计数。
6. PATCH raw body 含 `comicFormat` 时 file/db 都先 409；G3 不扩 DB 通用 metadata PATCH。
7. 图片字段固定 `sizePolicyVersion=legacy_generation_default_v1`；G2 source projection 仍是 `policyVersion=g2-task-source-v1`。
8. Candidate/Prompt 升 V2，digest 覆盖策略与尺寸；旧 V1 只读、不补推重放。
9. 成功 POST 先 upsert/navigate，不让随后 refresh 失败伪装成创建失败。
10. 不建设 reviewer/attestation/CAS 流水线，不提前实现 G5。

## 5. 当前不做

- G1 maintenance importer、MigrationIssue decision runner。
- 协调备份/恢复、final import、DB-only activate。
- 通用 DB Project metadata PATCH。
- PageProfile/LayoutPreset、复制为另一版式、正式多格布局。
- 真实 provider smoke 和真实 workspace 写入。

这些内容属于 G3-M、G5 或独立任务。缺口不是扩大 G3-core 范围的授权。

## 6. Stop condition

出现以下任一项立即停止并提交 findings：

- 需要改已应用 0008/0009。
- 需要第 45 个模型、新业务字段或 rebuild Project 表。
- 需要默认转换四格、缺失或非法值。
- 需要重写历史 Preflight/Layout/Task 或 digest。
- 需要让 Web 解析 message 或自行推断 canonical。
- 测试将访问真实 workspace、真实 DB 或真实 key。

## 7. 每切片交付物

```text
目标与基线 commit
修改文件清单
精确验证命令、退出码和结果
新增/更新 fixture
未完成项与 Stop condition
更新 task progress/findings
```

最终 E0 还必须提供 `scrutiny_review.md`、临时环境 `runtime_user_review.md`、截图和 G3-core test summary。

## 8. 完成名称

- A0～E0 全部通过：只能写 `G3-core completed`。
- importer/决议/备份/activate 未完成：保持 `G3-M integration_blocked`、真实发布 `release_blocked`。
- 只有 core + M + rollout gate + 真实用户复核全部通过，才能写 `G3 production-ready`。

## 9. 建议首个任务

```text
目标切片：G3-A0 Shared canonical
基线：收到施工资料后的实际 commit
允许修改：packages/shared/src/comic-format.ts、domain.ts、dto.ts、index.ts 及直接受影响的 exhaustive compile 点/对应测试
禁止：DB/file/API/Web/importer/G5
退出：Shared 两值与 catalog/predicate/DTO tests 通过，三包 typecheck 无被 as/fallback 掩盖的枚举错误
```

完成 A0 后再领取 A1 或 B0，不跨切片顺手实现。
