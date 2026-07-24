---
doc_id: AIR-TASK-20260724-MANGA-TEXT-STATE-FIX-SCRUTINY
status: completed
created: 2026-07-24
updated: 2026-07-24
owner: AI漫游项目
audience: human, ai-agent, developer, qa
source: task_plan.md、源码、自动化测试与两路独立只读复核
---

# Scrutiny Review

## 结论

- 最终分级：S0=0、S1=0、S2=6。
- 上轮真人路径中的文字丢失、跨对象串写和不完整 Undo/Redo 均已关闭。
- 首轮复核发现的键盘历史、受控字体竞态、资源就绪前滚动、dirty 手机预览，以及末轮发现的章节保存串线、跨浏览器未知根段落均已关闭并回归。
- 结论：`PASS（with observations）`。

## 已关闭问题

| 问题 | 修复证据 |
| --- | --- |
| contenteditable 键盘 Undo/Redo 走浏览器历史 | Workspace 阻止默认行为并调用 Session；DB E2E 覆盖 Undo/Redo 端点 |
| `document.fonts.ready` 早于受控字体 loader | loader 提供 generation 隔离的 `loading/ready/error` 权威状态 |
| 资源 ready 前滚动提前解锁 | 非 ready 清空审核；最终 ready 回顶并要求重新浏览 |
| dirty 手机预览读取旧 Working Copy | 点击手势内同步开窗，等待保存成功后才导航 |
| 章节 A 保存响应污染章节 B | 保存捕获 `projectId/chapterId/loadGeneration`，仅当前上下文可提交 |
| 已有 autosave 时手机预览误报失败 | `flush()` 等待 flight；若仍 dirty，继续保存当前状态 |
| 未知根段落被忽略 | 按根 childNodes 顺序读取；结构漂移后重建 DOM 和光标 |

## 最终验证

| 验证 | 结果 |
| --- | --- |
| Web 默认测试 | 47/47 passed |
| Shared 全量 | 37 files / 250 tests passed |
| 编辑器 DB E2E | 1/1 passed（37.5s） |
| 智能完整预览 DB E2E | 4/4 passed（46.5s） |
| 根类型检查 / E2E 类型检查 | passed |
| Shared / Server / Web build | passed；仅既有 AppShell chunk warning |
| `git diff --check` | passed |

## 剩余 S2

1. 浏览器菜单或右键触发的 `beforeinput historyUndo/historyRedo` 尚未显式接管；已验证的键盘快捷键不受影响。
2. 受控字体瞬时加载失败后没有页面内重试入口，目前需刷新或切换页面。
3. 字体目录变化时无用 `FontFace` 主要在组件卸载时清理，存在低风险生命周期和内存残留。
4. 保存请求没有专用超时或取消；极端网络悬挂时，预览准备可能长时间等待。
5. 1024～1260px 顶栏使用两行布局的固定偏移；极端浏览器缩放或系统大字体形成第三行时仍可能遮挡浮层。
6. Unicode format-control 已有 V1 回归并由 V2 投影继承，但 V2 入口和部分 default-ignorable mark 尚缺显式用例。

## 非阻断观察

- 首格自动 thought 气泡较窄、断行接近竖排且触及人物脸部，需要人工移动或放大。
- 默认 24% 缩放和长属性面板降低精修效率。
- Server 根测试受限环境中的监听、Chromium 和 IPC 权限失败已在授权环境复核；唯一 5 秒时序超时精确复跑通过，不构成稳定功能失败。
