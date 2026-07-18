---
name: image-candidate-generate
description: 当前章节已确认分镜并通过出图准备后，根据一个正式漫画 Shot、当前镜头角色与场景参考资产生成一张无字、无分格、单场景、单静态瞬间的漫画候选底图 Prompt；不读取 motion、对白、字幕或整页排版要求。
---

# image-candidate-generate

把一个正式漫画分镜镜头转换为可提交图片服务的干净漫画底图制作简报。

## 进入条件

- 当前章节存在已确认 `StoryboardVersion`。
- 出图准备已放行。
- 当前镜头角色和场景引用已经后端解析。
- 用户明确发起候选图生成；不得自动生图。

## 输入

只读取：

- `comic.panelDescription` 或 `coreAction` 的静态决定性瞬间。
- `coreAction`、`emotion`。
- `comic.composition`。
- `shotType`、`cameraAngle`。
- 当前镜头角色身份与外观。
- 当前镜头场景、时间、氛围和项目画风。
- 已确认的角色预览图和场景参考图。

不得读取或传递章节标题、comic dialogue/caption、motion、voiceLines、旧 `promptDraft`、整页版式和未来剧情。

## 生产模板

- 领域 Prompt 骨架： [references/candidate-prompt.md](references/candidate-prompt.md)
- 领域字段、输出合同和负向词： [references/candidate-config.json](references/candidate-config.json)
- OpenAI、豆包、Grok 的单 Prompt 传输包装与参考图职责： [references/provider-profiles.json](references/provider-profiles.json)

三个 provider profile 只改变语言、标题和单字符串投递格式，共享同一镜头事实、人物数量、动作归属、构图和禁止项，不是三套创作方法。

以上 reference 是生产 Prompt 事实源。后端只负责填充 `{{PLACEHOLDER}}`、选择 provider profile、绑定参考图、创建任务和保存版本。

## 输出合同

- 一次只生成一张完整无边框图片。
- 只包含一个场景、一个静态瞬间和一个机位构图。
- 保持角色身份、服装、道具、场景地标、空间关系和主光方向。
- 不生成文字、气泡、字幕、拟声词、UI、水印或标志。
- 不生成多格漫画、整页排版、分屏、边框、拼贴、联系表或角色设定表。

## 禁止事项

- 不调用图片服务绕过用户触发和费用控制。
- 不生成真人摄影、Cosplay 或 3D 渲染。
- 不添加未命名路人、复制角色、互换动作发起者和承受者。
- 不把动作前、中、后三个状态塞进同一张图。
- 不因 provider 不同改变剧情、人物数量或构图语义。
