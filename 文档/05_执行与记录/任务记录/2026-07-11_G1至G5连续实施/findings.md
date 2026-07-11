---
doc_id: AIR-TASK-20260711-G1-G5-IMPLEMENTATION-FINDINGS
status: active
created: 2026-07-11
updated: 2026-07-11
owner: AI漫游项目
audience: human, ai-agent, developer, qa
source: G1 事实源与代码只读审计
---

# Findings

## 已确认事实

- G0 已完成；整个 G0–G5 Goal 尚未完成，当前从 G1 开始。
- `apps/server/prisma/schema.prisma` 只有 6 个未接线模型，无 migration history、PrismaService、UoW 或业务 CRUD。
- `ProjectRepository` 的 Map + workspace 扫描/整树重写仍是业务事实源；`ProjectStore.getReadyProject()` 读取时也可能写盘，不能复用为 DB-only 查询层。
- `TasksService`、Dialogue threads 和多类 pending 仍在内存；图片候选与角色/场景各有独立 Promise 队列。
- `SettingsService` 仍把文本和三类图片 key 明文写入 `app-settings.json`，公开 DTO 仍含 `keyPreview`。
- Asset 直接写最终路径后再保存聚合，没有 staged/ready、sha256、Outbox 或恢复扫描；项目删除与迟到 worker 存在竞态。
- G0 E2E 只有临时 workspace，尚无独立 dataRoot/fake SecretStore marker；直接注入 `e2e-fake-key` 不能作为 G1 泄密验收。

## G1-0 Worker 结论

- G1 自动化根目录契约已固定为 `<temp>/airoaming-e2e-<runId>/{workspace,data,fake-secret-store}`，共享 `.airoaming-test-root` 同时绑定 runId 和三根绝对路径；仓库内 runtime state 也绑定相同路径，不能跨 run 复用。
- fake sentinel 不进入 child env、marker、runtime state、workspace 或 dataRoot；测试扫描只允许它命中 `fake-secret-store/image-provider.secret`。
- `cleanupE2EWorkspace` 继续支持 Server 先释放 workspace；全局 teardown 随后在允许 workspace 已缺失的前提下，重新校验共享 marker 与其余 owned roots，再删除整个 testRoot。启动失败与正常 Playwright teardown 都已运行通过。
- `SevenStageFixture` 需要主动清除可能继承的图片/文本 provider key；否则空 settings 会从真实环境变量生成默认配置。当前 fixture 在 Nest context 创建前清除这些值，dispose 后逐项恢复原环境。
- tempRoot 必须先对现存父目录做 `realpath` 规范化，再从 canonical parent 构造 testRoot；这样可兼容 macOS `/var -> /private/var` 的合法别名，同时拒绝把 symlink 指向 repo workspace、真实 dataRoot 或 home。prepare 还会再次核对 canonical parent，避免只检查最终 testRoot。
- E2E 父进程不能靠删除一小组已知 key 保证隔离，因为 Playwright 会把父环境继续合并给 webServer；当前父环境与 child 共用 allowlist 重建，未列出的 OpenCode/Google/Docker/npm 和任意 token 不进入测试进程。
- 测试 DB 明确绑定 `file:<temp-dataRoot>/db/airoaming.sqlite`，并创建 `data/db/` 父目录；G1-0 固定 `AIROAMING_PERSISTENCE_MODE=file`。`AIROAMING_MAINTENANCE_MODE` 在普通测试中必须完全不设置；accepted 契约只允许 `true` 表示“启动即维护”，`open/draining/closed` 是进程内协调状态而不是环境枚举。
- marker 和 owned-root 在删除前连续重读只能降低校验与删除之间的 TOCTOU 风险，不能宣称从操作系统层面彻底消除竞态；当前安全边界还依赖 run-bound canonical parent、不可跟随的最终 symlink 检查和失败即拒删。
- canonical 栅栏必须同时覆盖临时业务根和仓库内 runtime state 根。`cleanupE2EWorkspace/cleanupE2ERuntime` 在动作开始与每次递归删除紧前复验 temp parent；`prepareRunState`、state read/write、process-state rename 和 runtime cleanup 同样复验 `repo/tests/.runtime` 的 canonical parent。parent swap 负例全部使用 sandbox repoRoot，不修改真实 `tests/.runtime`。
- 虽然当前 E2E 已固定 `OPENCODE_AUTO_START=false`、OpenCode/image 均指向 loopback fake，Settings 只读取临时 workspace，仍把 HOME、XDG_CONFIG_HOME、XDG_CACHE_HOME 指向 run 临时目录，阻断未来 SDK/SecretStore 默认发现真实 credential 文件的回归面。
- 安全边界中的“真实账户 home”不能在每次校验时调用受环境影响的 `os.homedir()`；E2E runtime 与 SevenStageFixture 都在模块载入时使用 `userInfo().homedir` 捕获并 `realpath` 规范化稳定账户目录。即使 Fixture A 已把 `HOME` 指向 run 临时目录，Fixture B 仍必须在创建任何 owned root 前拒绝真实账户目录。
- `sanitizeInheritedEnvironment` 不再允许任意 `LC_*`；只精确放行标准 locale 名。`LC_FAKE_TOKEN` 与 OpenCode/Google/Docker/npm/任意 token 一样必须从 parent 和三类 child 环境消失。
- HOME/XDG 隔离会改变 Playwright 默认的 Chromium 查找位置，而 Playwright 1.61.1 worker 反序列化时会重新加载配置。主 runner 在清洗前读取 `chromium.executablePath()`；worker 只有在当前 HOME/XDG 与 `runtime.testRoot/home|xdg-cache` 精确相等，且官方路径位于该根下精确的 `ms-playwright` cache 时，才允许将安全非空 suffix 重锚到稳定账户 cache。最终 executable 只允许位于 canonical `userInfo().homedir` 默认 `ms-playwright` cache，或当前仓库中经 `@playwright/test` 依赖上下文精确解析出的 canonical `playwright-core/.local-browsers`；candidate realpath 后仍须严格位于对应允许根内、为普通文件并满足 `X_OK`。`PLAYWRIGHT_BROWSERS_PATH` 指向 `/tmp`、`/opt`、其他账户目录或 symlink 逃逸一律失败即止，不猜测、不扫描、不下载，也不进入 allowlist。`AIROAMING_E2E_CHROMIUM_EXECUTABLE_PATH` 一律忽略并从 parent/三个 webServer 环境清除；最终路径只写入全局与 Chromium project 的 `launchOptions.executablePath`。
- `global.setup.ts` 不得直接写 `runtimeDir/setup.json`。公共 `writeE2ESetupSummary` 在写入前后都验证 canonical runtime parent、matching run state 和目标类型；目标已是 symlink 或非文件立即拒绝。内容先写入本 run 目录内随机、`wx` 创建的 `0600` 临时文件，复验后 atomic rename；失败时仅在重新确认 run ownership 后清理临时文件。sandbox symlink 指向外部 sentinel 的负例证明外部 bytes/size/mtime 不变，正常首次写与重复替换均无临时残留。
- E2E runtime 与 SevenStageFixture 目前各有一套隔离实现。两套已覆盖相同的 canonical tempRoot、五字段 marker、四根 symlink、secret/DB 环境和恢复契约；重复实现是待 M0 收敛为共享测试隔离模块的技术债，本切片不越界重构生产持久层。
- 本切片只建立 fake SecretStore 的隔离载体和环境约定；生产 `ImageCredentialStore` adapter 尚不存在，也没有业务代码读取 fake store。该能力属于 G1 M1.6，不能把当前 sentinel 文件误报为 SecretStore 生产实现。

## 实施前决议

旧数据中的 `chapter_001`、`shot_001`、`script_outline_current` 等 ID 只在项目/章节作用域稳定，不能直接进入全局字符串主键。G1 importer 使用：

```text
sourceKey = workspace-v1:<projectId>:<entityType>:<legacyId-or-relative-key>
entityId  = stable scoped rekey(projectId, entityType, legacyId-or-relative-key)
```

- 原 legacy ID、路径和摘要保存在 `ImportedEntitySource`。
- project ID、已验证全局唯一且无碰撞的旧 ID 可以保留；作用域 ID 必须稳定重键。
- 新 runtime 实体使用 UUID v4。
- 现有容错型 `ProjectRepository` 不能作为 importer；必须新建严格、只读、确定性的 `LegacyWorkspaceReader`。

## 新增门禁

- `ENV-01～04`：三根隔离、marker、环境秘密清洗、真实目录不变。
- `SCH-00`：精确核对 44 个领域模型及约束，不允许缺失或额外业务表。
- `TSK-00`：没有完整 TaskPolicy 的 runtime task 不得创建。
- `OTB-01～05`：Outbox claim/fencing/幂等/backoff。
- `DEL-00`：deleting 项目拒绝新写和新任务。
- `MNT/SNP/RUN`：同 PID maintenance、snapshot 与无秘密 runtime bundle。
- `ACT-01～08`：DB-only 启动/激活/fallback 禁止/firstBusinessWriteAt。
- `WIT-01`：旧 fixture 经正式 snapshot/import 后以 DB-only reopen，语义等价。

## 风险

1. scoped legacy ID 全局碰撞。
2. file mode 读取即写入，误接线会污染旧源。
3. 整聚合保存与双 Promise 队列导致并发丢更新。
4. SecretStore 迁移后旧二进制不能恢复 plaintext，回滚必须使用兼容 G1 版本。
5. M4 正式切换是外部状态变更，必须在动作发生前重新取得用户明确授权。
