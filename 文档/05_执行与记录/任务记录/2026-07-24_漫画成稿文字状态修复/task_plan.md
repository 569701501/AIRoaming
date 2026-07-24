---
doc_id: AIR-TASK-20260724-MANGA-TEXT-STATE-FIX-PLAN
status: completed
created: 2026-07-24
updated: 2026-07-24
owner: AI漫游项目
audience: human, ai-agent, developer, qa
source: 漫画成稿真人浏览器验收 Handoff
---

# 任务计划：漫画成稿文字状态修复

## 目标

修复漫画成稿中画布选中对象、属性/富文本面板、`LayoutDocumentV2` 和 Shared command history 的身份与状态断链，使气泡改型、改字、横竖排和 SFX 均可保存、刷新、完整 Undo/Redo，并关闭真人验收中阻断普通用户的关键 P1。

## 非目标

- 不新增滤镜、网点、新气泡轮廓或 `LayoutDocumentV3` 字段。
- 不重写 Konva、Working Copy、Revision 或 Publication 架构。
- 不绕过 Shared command、预检或不可变 Revision。
- 不以 DOM fixture 通过替代真实浏览器画面复核。

## 强制验收

1. 气泡 `thought → shout → 改字 → 竖排` 后画布仍显示正确文字。
2. Undo 三次逐步恢复方向、文字和类型；Redo 三次逐步重放。
3. 新增文字后富文本面板显示该对象内容；输入“轰——”并应用 SFX 后画布、保存、刷新和手机预览一致。
4. 切换多个文字/气泡对象时，不复用上一对象的编辑器内容。
5. 预检 fail-closed 拦截可见文本空渲染或文档/编辑器不一致。
6. `1180px` 仍可找到手机预览与版本出版；手机预览失败有可理解反馈。
7. 智能完整预览只有视觉资源就绪且用户实际浏览完整后才允许应用。
8. 定向测试、Web 全量、Shared/Server 受影响测试、类型检查、构建和真实浏览器路径通过。

## 阶段

### 1. 事实源与反馈环

- [x] 读取产品、架构、ADR、模块、验收和上轮 Handoff
- [x] 定位相关代码和现有测试
- [x] 建立最小确定性红灯

### 2. P0 垂直切片

- [x] 对象切换与富文本内容同步
- [x] 文字内容和 runs 的原子命令
- [x] 气泡类型、方向和 SFX 的完整历史
- [x] 空渲染/不一致预检

### 3. P1 垂直切片

- [x] 窄屏关键入口
- [x] 手机预览失败反馈
- [x] 智能完整预览门禁

### 4. 验证与复核

- [x] 定向/全量测试和构建
- [x] 真人浏览器复测
- [x] Scrutiny Review
- [x] Runtime/User Review
- [x] 完成记录与长期记忆

## 退出标准

- 所有强制验收通过。
- 不存在只在浏览器 DOM 中正确、而 LayoutDocument/保存/刷新不一致的路径。
- 上轮 S0 不再复现；若仍有 S0，不得以部分完成退出。

## 当前结论

- 状态：`completed_with_observations`。
- 上轮文字丢失、跨对象串写和逐字 Undo 的 S0，以及独立复核发现的六类 S1 均已关闭。
- 1180px 桌面编辑、手机只读预览、空文字 fail-closed、智能完整预览、章节切换保存隔离和跨浏览器多段输入均有自动化或真实页面证据。
- 最终 Scrutiny Review 为 S0=0、S1=0；Runtime/User Review 为 `PASS（with observations）`。
