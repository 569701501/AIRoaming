# 分镜字段完整性调研 · findings

---
doc_id: AIR-TASK-2026-06-21-STORYBOARD-FIELDS-FINDINGS
status: active
created: 2026-06-21
updated: 2026-06-21
owner: AI漫游项目
audience: human, ai-agent, developer
source: 业界对照搜索 + 代码内部消费链验证
---

## 1. 核心结论（先看这个）

**"字段是否够支撑后续流程"这个问题，用代码事实回答是：当前几乎没有任何字段被真正消费，所以"够不够"在代码层面暂时无意义。**

关键发现：后端 `shot_prompt_generate` / `image_generate` / `layout_export` 在代码库里**根本没有"读 shot 字段构造下游产物"的逻辑**。候选图生成只校验 `shot.id` 是否存在于已确认分镜（`projects.service.ts:1651-1664`），真正的出图 prompt 由外部 AI/插件生成，不是后端读 comic 字段拼的。layout_export（排版）和 tts/video（配音/视频）的代码**完全不存在**。

因此问题的真实形态是两层：
1. **当前（MVP 已落地）**：comic 字段够，因为下游消费还很简单（只有前端展示 + shot 存在性校验）。motion 字段也"够"，因为根本没有消费者。
2. **未来（出图提示词真实化 + 漫剧落地）**：才有"够不够"的判断空间。这时要对照业界标准看缺口。

下面分别给两层证据。

---

## 2. 内部验证：每个字段被读情况（代码事实）

### 2.1 验证方法
全库（排除 dist）搜索每个字段的读取点，区分"生成时写入/normalize"、"前端展示"、"后端下游任务消费"三类。

### 2.2 字段消费表

| 字段 | 写入 | 前端展示 | 后端下游真实消费 | 判定 |
|---|---|---|---|---|
| `id` | dto | — | 任务校验 shot 存在性（1651） | ✅ 有 |
| `order` | normalize | 排序 | — | 仅排序 |
| `beatId` | normalize | — | **无** | ⚠️ 死字段 |
| `sceneId` | normalize | getShotSceneName 展示 | — | 仅展示 |
| `characterIds` | normalize | — | **无**（出图准备未读它构造 prompt） | ⚠️ 死字段 |
| `coreAction` | normalize | 展示+编辑 | — | 仅展示 |
| `emotion` | normalize | 展示+编辑 | — | 仅展示 |
| `comic.panelDescription` | normalize | 展示+编辑 | **无**（出图 prompt 不读它） | ⚠️ 无后端消费 |
| `comic.composition` | normalize | 展示+编辑 | **无** | ⚠️ 无后端消费 |
| `comic.dialogue` | normalize | 展示+编辑 | **无**（无排版/气泡代码） | ⚠️ 无后端消费 |
| `comic.caption` | normalize | 展示+编辑 | **无**（无旁白渲染） | ⚠️ 无后端消费 |
| `comic.panelRhythm` | normalize | 展示+编辑 | **无** | ⚠️ 死字段 |
| `motion.visualDescription` | normalize | 展示+编辑 | **无** | ⚠️ 无后端消费 |
| `motion.compositionDesign` | normalize | 展示+编辑 | **无** | ⚠️ 死字段 |
| `motion.cameraMovement` | normalize | 展示+编辑 | preview 拼接（657） | 仅展示 |
| `motion.voiceRole` | normalize | 展示+编辑 | **无**（无 TTS） | ⚠️ 无后端消费 |
| `motion.line` | normalize | 展示+编辑 | **无**（无 TTS） | ⚠️ 无后端消费 |
| `motion.durationHint` | normalize | 展示+编辑 | **无**（无视频） | ⚠️ 无后端消费 |
| `motion.frameType` | normalize | 展示+编辑 | preview 拼接（657） | 仅展示 |
| `promptDraft` | normalize | — | **无**（候选图阶段不读它） | ⚠️ 死字段 |

证据文件：`apps/server/src/projects/projects.service.ts:1651-1664`、`apps/server/src/dialogue/dialogue.service.ts:1628-1688`、`apps/web/src/components/workbench/StoryboardWorkspace.vue:52-108`、`apps/server/opencodeAI/plugin/airoaming-tools.js`（只有角色图/场景图工具，无 shot 出图工具）。

### 2.3 内部验证的解读

- **当前不是"字段不够"，而是"下游还没接上"**。shot_prompt_generate/image_generate 只是任务标签，后端没读 shot 内容字段；layout/tts/video 代码不存在。
- 所以现在谈"comic/motion 字段够不够支撑后续流程"，是在为**还没实现的下游**做提前判断。这是合理的前瞻设计，但要明确：结论是"规划层面够不够"，不是"现在能不能跑通"。

---

## 3. 外部对照：业界分镜字段标准

### 3.1 影视 / shot list 标准（StudioBinder、Boords、Adobe 等）

业界标准 shot list 字段（综合多个专业来源）：

| 业界字段 | 含义 | 我们有没有 | 对照说明 |
|---|---|---|---|
| Shot Number | 镜头编号 | ✅ `order` | 对应 |
| Scene Number | 场景归属 | ✅ `sceneId` | 对应 |
| **Shot Size** | 景别（特写/近景/中景/全景/远景） | ⚠️ 混在 `comic.composition` 里 | **业界是独立字段，我们没单列** |
| **Camera Angle** | 机位角度（平视/俯/仰/荷兰角） | ❌ 没有 | **缺失**，混在 composition 文本里 |
| Framing / Composition | 构图 | ✅ `comic.composition` | 对应（但和景别混了） |
| **Focal Length / Lens** | 焦距/镜头 | ❌ 没有 | 漫画通常不需要，漫剧可考虑 |
| Camera Movement | 运镜 | ✅ `motion.cameraMovement` | 对应 |
| Duration | 时长 | ⚠️ `motion.durationHint`(字符串) | 业界用数字，我们用字符串 |
| Action / Shot Description | 动作描述 | ✅ `coreAction` | 对应 |
| Dialogue | 对白 | ✅ `comic.dialogue` + `motion.line` | 两份，有重复风险 |
| **VFX / Visual Notes** | 特效/视觉备注 | ❌ 没有 | 漫剧特效可能需要 |

### 3.2 漫画 / webtoon 标准（Clip Studio、Comistitch、BenArgon 等）

业界漫画/webtoon 分镜关注点：

| 业界关注点 | 含义 | 我们有没有 | 对照说明 |
|---|---|---|---|
| Panel description | 画面描述 | ✅ `comic.panelDescription` | 对应 |
| Dialogue（气泡） | 对白 | ✅ `comic.dialogue` | 对应 |
| Caption（旁白框） | 旁白 | ✅ `comic.caption` | 对应 |
| **Panel Size / 网格大小** | 画格大小（大格/小格/通栏） | ❌ 没有 | **webtoon 条漫关键**，决定阅读节奏 |
| **Gutter / 间距** | 画格间距（留白=停顿） | ❌ 没有 | webtoon 条漫节奏核心，"留白即停顿" |
| Composition | 构图 | ✅ `comic.composition` | 对应 |
| **Pacing / 节奏** | 阅读节奏 | ⚠️ `comic.panelRhythm`(文本) | 业界靠画格大小+间距控制，我们用文本描述 |
| Reading flow | 阅读流（视线引导） | ❌ 没有 | 条漫纵向引导 |

### 3.3 动态漫画 / motion comic 标准（Ken Burns effect 等）

业界动态漫画核心技术（Ken Burns effect = 静态图做平移/缩放伪动态）：

| 业界要素 | 含义 | 我们有没有 | 对照说明 |
|---|---|---|---|
| Pan / Zoom | 平移/缩放参数 | ⚠️ `motion.cameraMovement`(文本) | 业界要精确参数(起止框/速度)，我们用文本 |
| Duration | 时长 | ⚠️ `motion.durationHint`(字符串) | 同上 |
| **Easing / 缓动** | 运动加速度曲线 | ❌ 没有 | 动态漫画质感关键 |
| Layer / 视差 | 图层分层(前景/背景分离做视差) | ❌ 没有 | 高级动态漫画用 |

来源：
- [StudioBinder - 50+ Camera Shots](https://www.studiobinder.com/blog/ultimate-guide-to-camera-shots/)
- [Boords - Storyboard Templates](https://boords.com/storyboard-template)
- [Adobe - How to Make a Storyboard](https://www.adobe.com/uk/acrobat/resources/how-to-make-a-storyboard.html)
- [Clip Studio - Webtoon Storyboard Components](https://tips.clip-studio.com/en-us/articles/10886)
- [Comistitch - Webtoon Vertical Scroll Paneling](https://comistitch.com/blog/webtoon-vertical-scroll-paneling-guide/)
- [BenArgon - Comic Panel Design Guide](https://benargon.com/comic-panel-tools-techniques/)
- [Wikipedia - Ken Burns effect](https://en.wikipedia.org/wiki/Ken_Burns_effect)
- [Cloudinary - Ken Burns Effect Guide](https://cloudinary.com/guides/image-effects/ken-burns-effect-complete-guide-and-how-to-apply-it)

---

## 4. 综合判断：够不够 + 缺口清单

### 4.1 当前阶段（MVP 出图链路）：够

现在出图链路还没读 shot 内容字段（只校验 shot 存在性），所以 comic/motion 字段在"当前能否跑通"层面**完全够用**，甚至偏多（panelRhythm、motion 大部分字段都没消费者）。

### 4.2 未来阶段：按下游落地顺序看缺口

| 优先级 | 何时需要 | 缺什么 | 为什么 |
|---|---|---|---|
| **高** | 出图提示词真实化（shot_prompt_generate 真读 shot）时 | 把景别从 composition 拆出为独立字段 `shotSize`；定义景别枚举 | 业界标准做法，景别是出图最关键参数之一，混在文本里 AI 抓不准 |
| **高** | 出图提示词真实化时 | 让出图 prompt 真正读 `coreAction`/`characterIds`/`sceneId`/`panelDescription` | 现在没读，等于字段白存 |
| 中 | 排版（layout_export）落地时 | `comic` 可能要补画格大小/占比（webtoon 条漫的画格尺寸是排版核心） | webtoon 业界靠画格大小控节奏，现在没有这个字段 |
| 中 | 排版落地时 | `characterIds` 要被排版读（决定画格里画谁） | 现在死字段，但排版必须用 |
| 低 | 漫剧（P0.5）真做时 | `motion.durationHint` 改成数字 `durationMs`；`voiceRole` 改 `characterId`；运镜要精确参数 | 业界动态漫画要精确数值，文本不够 |
| 低 | 漫剧高级效果时 | 视差图层、缓动曲线 | Ken Burns 高级用法，MVP 不需要 |

### 4.3 一个不需要改字段就能解决的隐患

`comic.dialogue` 和 `motion.line` 是两份对白，AI 可能写成不一致。这个**靠改 prompt 约束就能解决**（让 AI 基于 coreAction 派生、保证 dialogue 和 line 一致），不用改字段结构。

---

## 5. 给用户的最终结论

**你的直觉是对的——确实存在缺口，但缺口不在"现在缺字段"，而在"下游还没接上"。**

1. **当前够用**：comic 5 个字段 + motion 7 个字段，对现在的出图链路（还很简陋）绰绰有余，甚至有冗余。
2. **未来第一个真缺口**：当 shot_prompt_generate 真正读 shot 字段构造出图 prompt 时，**景别（shotSize）应该从 composition 里拆出来独立成字段**。这是业界标准，也是最影响出图质量的字段。这是唯一一个建议"现在就规划、真做出图时补"的字段。
3. **webtoon 排版缺口**：如果做条漫排版，画格大小/占比是核心，现在没有。等做 layout_export 时再补。
4. **漫剧字段**：motion 现在的 7 个字段语义够，但 durationHint 是字符串、voiceRole 不是 id 这些瑕疵，等真做 tts/video 时一并收拾，别提前优化。
5. **别现在大改**：下游还没接，提前改字段是给不存在的需求做优化，容易过度设计。

---

## 6. 风险与残留

- **风险**：本结论基于"出图提示词由外部 AI 生成、后端不读 shot 字段"的代码事实。如果未来改成后端拼 prompt，缺口判断要以新代码为准。
- **残留**：beatId、characterIds、promptDraft 当前是死字段，但它们在产品语义上是正确的（分镜本该有 beat 追溯、角色归属、提示词草稿）。死是因为下游没接，不是字段设计错。不建议删，建议等下游接上。
