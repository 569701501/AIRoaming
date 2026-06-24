# 探索发现与方案拷问

---
doc_id: AIR-TASK-PROJECT-STORE-FINDINGS
status: active
created: 2026-06-24
owner: AI漫游项目
audience: human, ai-agent
source: 任务 2026-06-24_ProjectStore骨架抽取 Orchestrator 阶段
---

## 1. 背景

第四轮发现角色编排与 Service 骨架深度耦合,无法直接搬走。本轮目标是抽 ProjectStore 收口骨架(getReadyProject/writeProjectFiles/ensureDefaultChapterReady/selectCurrentChapter),解开耦合,为后续 CharacterReferenceService 铺路。

## 2. 骨架方法清单与职责

| 方法 | 行 | 被调次数 | 职责 |
| --- | --- | --- | --- |
| ensureProjectsLoaded | 202 | 4 | 触发 repository 加载缓存 |
| getReadyProject | 3036 | 41 | 加载 + 确保默认章 + 返回项目 |
| writeProjectFiles | 2214 | 30 | 构造 workflow + repository.saveProject |
| ensureDefaultChapterReady | 2257 | 1(getReady 内) | 读 script.md 兜底 + 写回 |
| selectCurrentChapter | 3046 | 1 | 切章 + 写回 |
| getCurrentChapter | 3026 | 多 | 纯查询(已在 wsDomain) |
| assertProjectStillActive | 3030 | 多 | 查 repository.hasProject |

核心骨架:getReadyProject(读)+ writeProjectFiles(写)+ ensureDefaultChapterReady(读兜底)。

## 3. writeProjectFiles 的耦合点(关键)

```typescript
writeProjectFiles(project) {
  const workflow = workflowUtil.buildProjectWorkflow(project, chapter,
    imagePreflightUtil.isChapterImagePreflightReady(project, chapter,
      (pid, cid) => this.hasActiveCharacterReferenceTask(pid, cid, "final_reference")));
  await this.repository.saveProject(project, workflow);
}
```

writeProjectFiles 构造 workflow 时,通过回调调 `hasActiveCharacterReferenceTask`(查 tasksService 的角色任务状态)。这是骨架 ↔ 角色编排的耦合点。

## 4. 解耦方案:回调注入(已验证模式)

`hasActiveCharacterReferenceTask` 是纯 tasksService 查询(无写副作用)。第三轮 imagePreflightUtil 已经用回调模式 `isReferenceTaskRunning` 解过类似耦合。

ProjectStore 设计:
- 注入 repository + workspacePathService。
- writeProjectFiles 需要的 `isReferenceTaskRunning` 回调,通过 `setReferenceTaskChecker(fn)` 懒绑定(ProjectsService 在 onModuleInit 注入,因为 tasksService 在 ProjectsService 手里)。

```typescript
@Injectable()
export class ProjectStore {
  constructor(repository, workspacePathService) {}
  
  private referenceTaskChecker: (pid, cid, kind) => boolean = () => false;
  setReferenceTaskChecker(fn) { this.referenceTaskChecker = fn; }
  
  async getReadyProject(projectId) { ... }      // 原 getReadyProject
  async writeProjectFiles(project) {            // 原 writeProjectFiles
    const workflow = buildProjectWorkflow(project, chapter,
      isChapterImagePreflightReady(project, chapter, 
        (pid, cid) => this.referenceTaskChecker(pid, cid, "final_reference")));
    await this.repository.saveProject(project, workflow);
  }
  async ensureDefaultChapterReady(project) { ... }
  async selectCurrentChapter(project, chapterId) { ... }
}
```

## 5. ProjectsService 改造

- 注入 ProjectStore。
- onModuleInit:`projectStore.setReferenceTaskChecker((pid,cid,kind) => this.hasActiveCharacterReferenceTask(pid,cid,kind))`。
- 所有 `this.getReadyProject()` → `this.projectStore.getReadyProject()`(41 处)。
- 所有 `this.writeProjectFiles()` → `this.projectStore.writeProjectFiles()`(30 处)。
- ensureDefaultChapterReady / selectCurrentChapter 同理。
- `hasActiveCharacterReferenceTask` 留 Service(它查 tasksService,是 Service 的职责)。

## 6. 收益与风险

### 收益
- 骨架独立后,CharacterReferenceService 可依赖 ProjectStore(不依赖 ProjectsService)→ 循环彻底解开。
- getReady/write 逻辑内聚,71 处调用统一走 ProjectStore。
- writeProjectFiles 的 workflow 构造耦合显式化(referenceTaskChecker 回调)。

### 风险
- 71 处调用点替换,工作量大但机械(可 sed)。
- setReferenceTaskChecker 懒绑定有时序风险(onModuleInit 前调用 write 会用默认 false)——但 onModuleInit 是 Nest 启动时跑,实际请求都在它之后,风险可控。
- hasActiveCharacterReferenceTask 留 Service,ProjectStore 通过回调用——回调绑定必须在首次 write 前完成。

## 7. 范围决策

**本轮只抽 ProjectStore,不抽 CharacterReferenceService**。
- ProjectStore 抽出 + 验证通过后,CharacterReferenceService 作为下一轮(那时骨架已独立,搬走安全)。
- 避免一轮做两件大事。

## 8. 退出标准

1. ProjectStore 抽出,getReadyProject/write/ensureDefault/selectCurrent 迁入。
2. ProjectsService 71 处调用改委托。
3. referenceTaskChecker 懒绑定生效。
4. Service 行数下降(预计 3272 → ~3050)。
5. typecheck + test 全绿。
6. Scrutiny 通过。

## 9. Scrutiny Review 静态复核结论(2026-06-24)

**结论:通过。**

### 9.1 拆分契约验证

| 检查项 | 结果 |
| --- | --- |
| Service 行数 | 3272 → 3184(-88 行) |
| 新 ProjectStore | 137 行 |
| typecheck 三包 | ✅ 全通过 |
| 全量 test | ✅ shared 15 + server 46 = 61 tests 全绿 |
| 骨架方法残留定义 | ✅ 0(grep 确认) |
| 委托调用 | getReadyProject(41)+writeProjectFiles(30)+findChapter(23)+withUpdatedChapter(13)+selectCurrentChapter(1)+assertProjectStillActive(3) |

### 9.2 循环依赖解开验证

拆分前:writeProjectFiles 直接调 `this.hasActiveCharacterReferenceTask`(角色方法嵌入骨架)。
拆分后:writeProjectFiles 在 ProjectStore 内,通过 `referenceTaskChecker` 回调查询角色任务状态;回调由 ProjectsService.onModuleInit 注入。骨架不再直接依赖角色方法 → **耦合解开**。

### 9.3 行为等价性

- 骨架方法逻辑体逐字迁移到 ProjectStore(仅去掉 private/this)。
- referenceTaskChecker 默认返回 false(Nest onModuleInit 在首次请求前注入真实 checker)。
- getCurrentChapter/readOptionalTextFile/clearProject*/createDefaultChapter/updateCurrentChapterSource 保留 Service(纯委托或 Service 专属逻辑,被内部多处引用)。

### 9.4 残留风险

- referenceTaskChecker 懒绑定有时序假设(onModuleInit 先于请求)。Nest 保证 onModuleInit 在服务就绪前执行,风险可控。
- ProjectStore 无独立单元测试。靠 source-guard.spec(注入 ProjectStore mock)+ 现有集成路径间接覆盖。
- 阶段目标达成:骨架独立,下一轮 CharacterReferenceService 可依赖 ProjectStore 而非 ProjectsService。
