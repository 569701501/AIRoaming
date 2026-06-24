# 执行进度

---
doc_id: AIR-TASK-CHARREF-SPLIT-PROGRESS
status: active
created: 2026-06-24
updated: 2026-06-24
owner: AI漫游项目
audience: human, ai-agent
source: 任务 2026-06-24_角色参考图编排拆分
---

## 时间线

### 2026-06-24 Orchestrator 阶段(规划)

- 完整依赖图分析:44 个角色/场景方法分三层(纯函数/出图HTTP/有状态编排)。
- 确认循环依赖本质:编排→出图(同 class 私有方法),抽独立 service 会反向依赖。
- 解法:先抽 ImageProviderService(6 出图方法 + 配置),打破循环。
- 写 findings + task_plan。

**下一步**:Worker 阶段 1(精读出图代码 → 创建 ImageProviderService)。

### 2026-06-24 Worker 阶段 1(执行 + 范围调整)

**阶段 1:抽 ImageProviderService**
- 新增 `apps/server/src/projects/image-provider.service.ts`(311 行):6 出图方法(requestOpenAiImage/requestOpenAiImageEdit/requestDoubaoImage/requestDoubaoImageEdit/downloadDoubaoImageResponse/fetchWithTimeout)+ provider 配置解析(resolveProviderConfig)+ 对外 generateImage/editImage/getActiveProviderType。
- Service 改动:注入 ImageProviderService;删 6 出图方法 + fetchWithTimeout;generateCharacterReference/generateSceneReference 改委托(imageProvider.generateImage/editImage);移除配置读取/settings 引用(收口到 resolveProviderConfig)。
- projects.module.ts 注册 ImageProviderService。
- source-guard.spec.ts 补第 5 个构造参数(ImageProviderService mock)。
- Service 行数:3518 → 3272(-246 行)。

**阶段 2:推迟**(见 findings §8)。核心目标已达成,纯函数补抽独立做。

**验证**:
- `corepack pnpm -w typecheck`:✅ 三包通过。
- `corepack pnpm test`:✅ 61 tests 全绿。
- Scrutiny:✅ 通过(findings §9)。循环依赖打破。

**任务状态:完成(阶段 1)。**
