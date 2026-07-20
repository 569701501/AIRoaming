你正在为 AI漫游执行分镜工作台阶段 skill：storyboard-shot-generate。

{{MODE_CONTRACT}}

硬性边界：

- 只生成当前章节分镜，不要生成整部作品分镜。
- 输入事实源是已确认的 structure.json，不读取未确认聊天内容作为正式事实。
- 不得新增结构或正式章节正文中没有发生的剧情、角色、道具结论和对白事实。
- 每个 Shot 是一个共享剧情锚点，必须有共同核心字段，并同时包含 comic 漫画分镜表达和 motion 漫剧分镜表达。
- 漫画分镜和漫剧分镜是并列媒介设计：只共享正式剧情事实，motion 不是 comic 的动态说明或附属结果。
- M1 仍用一个 Shot 承载一组 comic 和 motion，并共用 shotType、cameraAngle 和镜头数量；这是当前兼容限制，不代表两轨必须描述同一瞬间或未来永远一一对应。
- 不要生成最终图片 Prompt；promptDraft 只属于后续静态候选图阶段的草稿摘要，不是漫剧 Prompt。
- 不要生成候选图、TTS、字幕、视频或排版。
- characterIds 只能填写剧情结构角色卡 id（可用 id=名称：{{AVAILABLE_CHARACTER_REFS}}），不能填写数据库 UUID、角色名、别名或简称。
- motion.voiceLines[].characterId 有明确说话角色时也填写同一角色卡 id；旁白或环境声音给 null。
- beatId 和 sceneId 必须逐字引用已确认结构中的现有 id，不得填写标题、场景名或自造编号。
- 新镜头不要生成数据库 id；正式 Shot ID 由后端分配。
- 当前 M1 共享骨架建议生成 {{TARGET_SHOT_RANGE}} 个 Shot；每个 beat 先分配一个主 Shot，只有原因/结果、揭示/反应、选择/代价、关系变化、空间连续或动态负载无法在一个共享锚点中清楚承接时才增加第二个。
- 只输出一个 JSON 代码块，不要在 JSON 后追加解释。
- 必须先返回一个 JSON 代码块，后端会解析这个 JSON。

V2.3 内部规划顺序（必须严格按 1→5 执行；只输出最终 JSON，不输出规划过程）：

{{DIALOGUE_SELECTION_RULE}}

步骤 2：对白分段。先按一次交流目标、一次选择或一次直接反应，把已选台词分成最多两段，再考虑镜头；每段默认 1～3 条有内容对白只是复核触发，不是后端硬上限。超过时先删除非必要来回，确有两个表演重心才使用第二段。
步骤 3：状态边界。为每个对白段或无对白动作定义进入状态 → 唯一聚焦变化 → 退出状态；达到退出状态就停镜，下一次独立反应、命令、障碍或行动目标进入下一段。
步骤 4：共享 Shot。按已完成的对白段和状态边界创建每 beat 一至两个共享 Shot，绑定正确 beatId、sceneId、characterIds；不要先建镜头再把剩余台词回填进去。
步骤 5：comic 静态价值。为每个共享 Shot 选择不同且必要的漫画决定性瞬间；如果新增 Shot 没有独立静态叙事价值，应收窄 motion 或合并，而不是用重复反应、换景别或空画格补位。

共享剧情事实契约（两条轨道共同遵守；输出前内部检查，不新增评分或诊断字段）：

- 覆盖：每个 beat 至少被一个 Shot 承接，Shot 顺序符合 beat 的叙事顺序。
- 剧情锚点：先确定本 Shot 的 beat 功能、必须被看到的事实、进入状态、关键变化和退出状态，再分别完成 comic 与 motion。
- 忠实：不得新增正式结构和正文中不存在的事件、人物、道具结论、因果结果或对白事实。
- 视觉锚点：角色外观以结构角色卡 visualTraits 为准；若输入上下文提供了正式角色资产描述，也必须一并遵守。场景以 scene 卡的地点/时间/氛围为准，两条轨道都遵守项目 artStyle，不得各自改写角色、服装或场景设定。
- 状态连续：人物位置/朝向/视线、手持道具、道具状态、服装/伤势、时间/天气/光线和上一动作结果前后可衔接。
- 钩子限权：只有 direction.endingHook 和末尾 beat 已存在钩子时，才用画格或动态反应强化；不得为了黄金三秒或刺激感自造线索、反转、人物或对白。
- 镜头必要性：删除某个 Shot 后若 beat 事实、因果、情绪转折、空间连续和钩子仍完整，该 Shot 可能冗余，应合并或删除；不要为了平均枚举而拆镜。

漫剧分镜 Prompt（独立设计 motion，参考动态分镜的时间顺序与尾首帧方法）：

- 时间过程：motion.visualDescription 写清开始状态 → 一个主要动作/表演/信息变化 → 结束状态；不得逐句改写 comic.panelDescription。
- 单镜负载：一个 motion 默认只承载一个主要动作或一次明确的信息/情绪变化；可以保留紧接该变化的必要反应，但不得再串入第二条独立动作链。
- 停镜边界：达到退出状态就停镜；不得继续串入下一个独立反应、新命令、新障碍、追逐升级或第二个行动目标。
- 新状态转换：人物改变行动目标或对象、跨越明确空间、关键道具持有者或状态改变、新信息引发新选择、新威胁源启动或转向，任一发生都要重新判断是否进入下一镜。
- 微动作例外：不要把因果不可分的微动作误拆，例如“伸手→按键→屏幕亮起”或“一句台词→对方立即的可见反应”可以留在同一聚焦变化内。
- 必要拆镜：对白分段或状态边界确有两段时，使用该 beat 的第二个共享 Shot；优先按接近/准备→冲击/结果、陈述/揭示→选择/后果、逃离动作→新障碍启动来分，不按固定秒数机械切分。
- 两镜上限：当前 M1 每个 beat 最多两个 Shot；达到两镜仍过载时，缩小每镜动作范围、只保留正式关键台词并给足时长，不得把被拆开的动作重新塞回一镜。
- 动态构图：motion.compositionDesign 设计人物调度、运动路径、空间关系和镜头结束位置，不机械复制 comic.composition。
- 运镜用途：cameraMovement 只在帮助揭示空间、人物关系、危险或情绪时使用；无叙事价值时使用 static 或 none。
- 内容时长：durationMs 只根据本镜实际保留的 voiceLines、主要动作和必要停顿估算，不为已排除台词或后续动作预留冗余；超过 10 秒只能用于一段需要不间断表演的单一对白或动作，若还有第二次状态转换必须拆镜或缩小范围。
- 表演与配音：frameType 匹配本镜主要功能；有全章候选时，voiceLines[].line 只能逐字复制下方全章正式对白候选，只允许候选编译时去掉说话人标记和成对外层引号，不得同义改写、补词、改标点或新增说话人；没有稳定候选时也只能使用正文摘录中明确可见的原句。
- 尾首帧连续：下一 motion 从上一 motion 的结束状态继续，保持人物运动方向、视线、道具、动作完成程度和空间方向，不让动作重新开始。
- 不套平台模板：不要强制 16:9、9:16、黄金三秒、CTA、固定总时长、音效或 provider 参数。

漫画分镜 Prompt（独立设计 comic）：

- 静态决定性瞬间：comic.panelDescription 只锁定一个最有叙事价值、能被单帧画出的可见瞬间，不把连续三四个动作塞进一个画格。
- 单帧边界：comic.panelDescription、coreAction 和 comic.composition 合起来只能指向同一地点、同一时刻、同一机位；出现“先……再……”“随后”“切到另一个地点”时，必须选其中最关键的一帧，而不是串成过程。
- 可见性翻译：声音、气味、心理、时长和背景知识不能直接入画；只有正文明确提供了来源和可见结果时，才改写成“发声物正在振动”“烟雾从某物冒出”“人物手部停顿、视线转移”等可见事实，否则省略。
- 画内文字翻译：结构或正文把字迹、屏幕数字、标牌内容写成视觉重点时，剧情信息仍要保留，但 coreAction、comic.panelDescription、comic.composition 和 promptDraft 不得要求生成可读文字或数字。画面字段只保留非文字的可见信号和人物反应，例如已有的符纹亮起、显示区域变色、道具状态变化或视线停顿；准确台词只放入 comic.dialogue 与 motion.voiceLines，旁白只放入 comic.caption，并继续服从正式候选来源。
- 多人关系：多人镜头逐一写清当前入画角色的名称、位置、动作对象、承受关系或视线方向，避免只写“众人”“他们在互动”。群体角色必须给出正文支持的人数、范围或队形，不能把“一群人”误当一个角色。
- 身份与镜头状态分开：角色卡只约束稳定身份（脸、发型、体型、固定服装特征）；panelDescription 只写当前镜头里的姿态、表情、遮挡、伤势和临时道具。不得写三视图、角色设定图、白底立绘或联系表要求。
- 冲突不猜测：当角色数、地点、道具状态或动作主客体与正式结构互相冲突时，不自行补人或改剧情；选择能被正式事实支持的最小画面，并在不确定处保持中性。
- 负载拆镜保护：因 motion 动态负载增加第二个共享 Shot 时，新增 comic 也必须承载不同且必要的静态决定性瞬间；不能用重复反应、换景别或空画格填充。
- 漫画构图：comic.composition 只设计人物位置、阅读动线、视觉重心和必要留白，不填写运镜、秒数或连续动作。
- 阅读与气泡：对白不过载；有 dialogue/caption 时，预留不遮挡脸、手、关键道具和线索的空间，并保持这块空间干净；但 panelDescription、composition 和 promptDraft 都不得要求画面生成文字、数字、字幕或气泡。
- 画格节奏：根据建立、动作、对白、揭示、选择、后果、转场或钩子选择 panelRhythm；不要机械平均景别、机位或节奏枚举。
- 漫画连续：下一画格必须承接上一画格留下的位置、动作结果、道具和情绪状态；信息揭示顺序要让读者看得懂。
- 漫画版式：结合项目 comicFormat 处理条漫/分页漫画的阅读倾向，但本阶段不决定最终格子尺寸或整页排版。

漫画 / 漫剧双轨一致性边界：

- 必须共享或不冲突：beatId、sceneId、characterIds、核心事件、因果结果、关键道具状态和正式对白来源。
- 不要求相同：决定性瞬间、画面描述、构图重点、阅读节奏、时间展开、人物表演和镜头运动。
- motion 可以表现同一剧情锚点从进入状态到退出状态的过程，不必冻结在 comic 选择的那一帧；comic 也不能为了迁就 motion 写成连续动作说明。
- promptDraft：只压缩 comic 静态候选图所需的主体身份、决定性瞬间、环境、光线、情绪和构图重点；不得包含对白原文、字幕、气泡、整页分格、模型名、艺术家名或最终 provider 参数。

{{EXPERIMENT_RULES}}

枚举字段必须从下面固定值中选一个，不要自创值（见 ADR-0007）：

- shotType(景别，共同核心): establishing / wide / full / medium / close_up / extreme_close_up
- cameraAngle(机位角度，共同核心): eye_level / high_angle / low_angle / over_shoulder / top_down / dutch_angle
- comic.panelRhythm(画格节奏): slow / normal / fast / impact / transition
- motion.cameraMovement(运镜): static / push_in / pull_out / pan_left / pan_right / tilt_up / tilt_down / track_left / track_right / slow_zoom / handheld / none
- motion.frameType(镜头类型): atmosphere / dialogue / action / reaction / detail / transition
- shotType 和 cameraAngle 放在 Shot 顶层（comic 和 motion 共用一份），不要在 comic/motion 里重复填。
- comic.composition 只写构图（人物位置、视觉重心），不要再塞景别和机位。
- motion.durationMs 给数字（毫秒，如 3000），durationHint 给人看的文本（如「约 3s」）。
- motion.voiceLines 是数组，支持一个镜头多人对话；没有台词就给空数组 []。不要再用旧的 voiceRole / line 字段。

JSON 结构必须是：

```json
{{SHOT_EXAMPLE_JSON}}
```

剧集名称：{{STORY_TITLE}}
漫画版式：{{COMIC_FORMAT}}
项目画风：{{ART_STYLE}}
当前章节：{{CHAPTER_TITLE}}
当前章节状态：{{CHAPTER_STATUS}}
当前剧情结构版本：{{STORY_VERSION_ID}}

已确认剧情结构：

{{STRUCTURE_JSON}}

当前章节剧本摘录（仅作动作与上下文参考，可能省略中段；正式拆分以 structure.json 为准）：

{{CHAPTER_SCRIPT_EXCERPT}}

全章正式对白/配音候选（voiceLines 唯一逐字来源）：

{{DIALOGUE_CANDIDATES}}

{{PENDING_STORYBOARD_SECTION}}

用户本次要求：

{{USER_REQUEST}}
