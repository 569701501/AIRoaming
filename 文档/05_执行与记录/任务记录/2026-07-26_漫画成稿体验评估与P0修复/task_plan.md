---
doc_id: AIR-EXEC-20260726-01
status: completed
created: 2026-07-26
updated: 2026-07-26
owner: AI漫游项目
audience: human, ai-agent
source: 2026-07-26 漫画成稿功能/样式/易用性评估会话
---

# 漫画成稿体验评估与 P0 修复

## 目标

对第 6 步「漫画成稿」编辑器做功能、样式、易用性三维评估,留痕结论,并完成 P0 级修复。

## 评估结论(2026-07-26,基于代码静态审计)

### 强项(不动)

- 数据链路产品级:命令化编辑(`EditorCommandV1`)、CAS 自动保存(800ms 防抖 + 5s 脏上限)、409 冲突三选一恢复、导出五阶段预检、文字变更「原文 vs 当前」确认。
- 能力面完整:多选/框选、八向缩放旋转、吸附参考线、对齐分布、裁切手势、气泡四类型 + 尾巴拖点、画格模板、阅读顺序、竖排/混排。

### 短板(按影响排序)

| # | 问题 | 位置 |
| --- | --- | --- |
| 1 | 无 Undo/Redo、无 Delete 快捷键、文字/气泡删除无确认,自动保存即时落库,误删不可恢复 | `LayoutExportWorkspace.vue` handleKeydown 2912–2940 |
| 2 | 全程「盲拖」:移动/缩放/裁切/尾巴拖动只有 Konva 描边框动,本体 dragend 才跳变 | `LayoutKonvaInteractionLayer.vue` 193–225 |
| 3 | 画布内零文字编辑,右侧富文本字号为真实值一半钳制(12–36px),改时无法感知真实大小/溢出 | `LayoutRichTextEditor.vue:204` |
| 4 | text 工具整条链死代码、`pointerdown.self` 不可达、两个孤儿 DocumentPreview 组件 | 多处,见 findings |
| 5 | 编辑器自成第三套私有蓝色主题(`--le-accent:#4f8cff`),与项目深夜蓝黑+紫/薄荷渐变不统一;选中态三种颜色并存(蓝/薄荷绿/橙) | `LayoutExportWorkspace.vue` 3052–3065 |
| 6 | 缩放范围不一致:滑杆 max 0.6 vs 滚轮 0.8 | 331 / `LayoutKonvaInteractionLayer.vue:543` |

### 样式结论

- 编辑器约 700 行私有 scoped 类 + `--le-*` 令牌,几乎不共享全局类;只读预览页为第四套硬编码色。
- 成稿是用户停留最久步骤,视觉落差最刺眼;按长期偏好(#0b1020 深夜蓝黑、克制紫渐变、玻璃分层、薄荷绿完成态)精修是主要欠账(P1)。

### 总体判断

能用,但停留在「工程演示」质感。真实用户断点链路:拖图不动 → 松手跳变 → 改气泡文字找不到入口 → 小框盲改字号 → 误删无 Ctrl+Z → 退出。

## 本次 P0 范围

- [x] Delete/Backspace 快捷键删除选中元素,删除前确认(文字/气泡/画格/自由图统一,`deleteElementsWithConfirm`)。
- [x] 统一缩放范围(滑杆与滚轮同为 0.1–0.8)。
- [x] 清理 `activeTool === "text"` 死代码链。
- [x] 删除孤儿组件 `LayoutDocumentVisualPreview.vue`、`LayoutDocumentMiniPreview.vue` 及契约测试引用。

## 附带修复

- `g5-m5-text-font.spec.ts`、`w1-web-route.spec.ts`、`g5-m8-cutover.spec.ts` 三处 07-24 收缩漏改的过时源码断言(把已退役 UI 的 `toContain` 改为锁定退役态)。

## e2e m7/m8 重写(同日追加)

ADR-0022 收缩时未同步 e2e,本次把 db 套件中两个成稿 spec 重写为基础版流程:

- `layout-publication-m7.spec.ts`:
  - 用例 1 改为「首次自动排版后一次导出闭环」:G4 fixture → 自动排版 V2 → 1×1 画格校准 → `layout-simple-export` → 导出对话框(新增 `completeSimpleExportFlow` 轮询助手,自动处理 review/blocked/failed,注意"导出完成"文案出现两次必须 `.first()`)→ 产物链接真实 PNG → 历史 API + DB 断言不变。
  - 用例 2 保留全部 V2 API 级断言(并发 409、双摘要、task sources 投影、restore/replay);UI 部分改为:候选来源横幅「同步最新镜头」替换旧预览/提交 UI;删除撤销/重做段(基础版无撤销,改验证自动保存落库);导出走 review「按当前文字导出」(文案为"首次排版沿用了人工确认的镜头更换");历史恢复从 UI 点击改为 API restore(路由保留)。
- `layout-mobile-ai-m8.spec.ts`:去掉「导出本章/m6 控制中心/Undo/立即保存」;画布尺寸步改为"预览→应用→再次应用改回"并用 API 验证 profile/段高;新增「V1 旧格式成稿不能导出」门断言;pending preview/discard/apply/expire(仅 V1 历史兼容,服务端仅接受 schemaVersion 1 批次)与手机只读步保持不变。

验证:`--mode=db --grep "layout-publication-m7|layout-mobile-ai-m8"` 3/3 通过。

## 已知残留

~~db 套件仍有 8 个用例引用收缩前 UI~~ 已全部处理(同日追加,见下)。

## 剩余 8 个 e2e 重写(同日追加)

- `layout-editor-m4`:去 legacy 初始化与「按镜头排版」,改自动排版;其余交互断言不变。
- `layout-editor-m5`:去全部撤销/重做与「立即保存」(saveNow 改为等自动保存);文字溢出导出走新对话框 blocked 态(TEXT_OVERFLOW blockingScopes=["export"],基础版为硬阻断,只有「返回修改」)。
- `layout-editor-m6`:重写为「来源横幅同步 → 1×1 校准 → 导出对话框 review → API restore」;版本历史 UI 断言改 API。
- `layout-smart-compose-m5`:4 删 2(字体加载失败/滚动审核两个用例只测已退役 pending 预览门禁),保留并重写「自动生成+直接编辑保护」与「页漫幂等」2 个用例。
- `candidate-decision-workbench`:末两步的退役 UI(导出本章/出版中心/按镜头排版)改为横幅文案断言 + API 预检 blockingScopes 断言。

### 重写中发现并修复一个真实 V2 产品 bug

`layout-editor-session.ts` 的 `toV2UserCommand` 用 `structuredClone(command)` 克隆命令;富文本「应用到选区」等命令 payload 携带 Vue 响应式 Proxy(selection ref 深层代理),`structuredClone` 对 Proxy 抛 `could not be cloned`,被 actionError 吞掉 → **V2 草稿下范围样式应用静默无效**(V1 路径无此克隆,所以旧 e2e 一直绿)。修复:改用 JSON 序列化克隆(命令 payload 本来就是严格 JSON 契约)。这是本次 e2e 重写逼出来的真实用户路径 bug。

## 验证

- `pnpm -r typecheck` + `typecheck:e2e` 全绿;`corepack pnpm test`:shared 257/257、server 777/777、web 54/54。
- e2e:db 套件 18/18、file 套件 4/4 全绿(2026-07-26)。

## 进度

见下方时间线。

- 2026-07-26 10:38 评估完成,留痕本文档,开始 P0 实施。
- 2026-07-26 10:55 P0 全部完成,单测全绿;m7/m8 e2e 过时问题已记录待处理。
- 2026-07-26 11:30 m7/m8 重写完成,db e2e 3/3 通过;发现另有 8 个 db 用例同为收缩遗留红灯,待用户决定排期。
- 2026-07-26 13:50 用户确认「按镜头排版」不再保留;剩余 8 个 e2e 全部重写/删除完成,db 18/18 + file 4/4 全绿;顺带修复 V2 范围样式 structuredClone Proxy 真实 bug。

## P1+ 后置(不在本次)

- 拖拽过程实时预览(dragmove 同步 DOM)。
- 气泡/文字画布内双击编辑入口。
- 编辑器主题并入项目统一视觉;选中色统一。
- 有限本地 Undo(不动 CAS 协议)。

## 进度

见下方时间线。

- 2026-07-26 10:38 评估完成,留痕本文档,开始 P0 实施。
