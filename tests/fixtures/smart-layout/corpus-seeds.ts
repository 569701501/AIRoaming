export type SmartLayoutFormat = "vertical_scroll" | "paged_comic";

export type LayoutIntent = "standard" | "focus" | "impact" | "wide" | "detail" | "pause" | "transition";

export interface VoiceSeed {
  characterId: string | null;
  name: string;
  line: string;
  voiceStyle: string;
  expectedBalloonKind: "speech" | "thought" | "shout";
}

export interface ShotSeed {
  scene: string;
  beat: string;
  characters: string[];
  coreAction: string;
  emotion: string;
  shotType: "establishing" | "wide" | "full" | "medium" | "close_up" | "extreme_close_up";
  cameraAngle: "eye_level" | "high_angle" | "low_angle" | "over_shoulder" | "top_down" | "dutch_angle";
  frameType: "atmosphere" | "dialogue" | "action" | "reaction" | "detail" | "transition";
  rhythm: "slow" | "normal" | "fast" | "impact" | "transition";
  visualAsset: string;
  layoutIntent: LayoutIntent;
  voices?: VoiceSeed[];
  comicDialogue?: string;
  caption?: string;
}

export interface VariantSeed {
  variantId: string;
  title: string;
  format: SmartLayoutFormat;
  coverageTags: string[];
  targetNarrativeGroups: number[][];
  shots: ShotSeed[];
  replacementAtOrder?: number;
  replacementAsset?: string;
}

export interface GroupSeed {
  groupId: string;
  title: string;
  variants: VariantSeed[];
}

const LIN = "char_linzhou";
const XU = "char_xucheng";
const ZHAO = "char_zhaoyan";
const GAO = "char_gaoyuan";

function voice(
  characterId: string | null,
  name: string,
  line: string,
  voiceStyle = "平静、自然",
  expectedBalloonKind: VoiceSeed["expectedBalloonKind"] = "speech",
): VoiceSeed {
  return { characterId, name, line, voiceStyle, expectedBalloonKind };
}

export const SMART_LAYOUT_CHARACTERS = [
  { id: LIN, projectCharacterId: "project_character_linzhou", name: "林舟", role: "调查记者", visualTraits: "灰蓝长风衣、左眉浅疤、旧银色录音笔" },
  { id: XU, projectCharacterId: "project_character_xucheng", name: "许澄", role: "档案管理员", visualTraits: "米白短外套、黑框眼镜、红色文件夹" },
  { id: ZHAO, projectCharacterId: "project_character_zhaoyan", name: "赵妍", role: "刑警", visualTraits: "深色夹克、短发、警用手电" },
  { id: GAO, projectCharacterId: "project_character_gaoyuan", name: "高远", role: "港口调度员", visualTraits: "橙色雨衣、旧工牌、宽肩" },
] as const;

export const SMART_LAYOUT_GROUPS: GroupSeed[] = [
  {
    groupId: "FIX-V01",
    title: "条漫单人独白",
    variants: [{
      variantId: "fix-v01-vertical",
      title: "雨夜屋顶的单人独白",
      format: "vertical_scroll",
      coverageTags: ["single_character", "speech", "thought", "long_short_balloon", "slow_rhythm", "caption"],
      targetNarrativeGroups: [[1, 2], [3], [4, 5], [6]],
      shots: [
        { scene: "屋顶", beat: "钩子", characters: [], coreAction: "雨幕压住城市天际线", emotion: "孤寂", shotType: "establishing", cameraAngle: "high_angle", frameType: "atmosphere", rhythm: "slow", visualAsset: "wide_environment", layoutIntent: "wide", caption: "凌晨两点，整座城只剩雨声。" },
        { scene: "屋顶", beat: "钩子", characters: [LIN], coreAction: "林舟低头听录音", emotion: "迟疑", shotType: "close_up", cameraAngle: "eye_level", frameType: "reaction", rhythm: "slow", visualAsset: "portrait_left", layoutIntent: "standard", voices: [voice(LIN, "林舟", "如果我现在停下，真相就会永远沉下去。", "内心、克制", "thought")] },
        { scene: "屋顶", beat: "线索", characters: [], coreAction: "录音笔红灯闪烁", emotion: "紧张", shotType: "extreme_close_up", cameraAngle: "top_down", frameType: "detail", rhythm: "slow", visualAsset: "landscape_detail_bottom", layoutIntent: "detail", caption: "第七码头，零点四十分。" },
        { scene: "屋顶", beat: "决定", characters: [LIN], coreAction: "林舟把录音笔放进口袋", emotion: "坚定", shotType: "medium", cameraAngle: "low_angle", frameType: "dialogue", rhythm: "normal", visualAsset: "portrait_right", layoutIntent: "standard", voices: [voice(LIN, "林舟", "先把录音送出去，再回去找她。", "低声、坚定")] },
        { scene: "屋顶", beat: "决定", characters: [LIN], coreAction: "林舟抬眼看向楼梯门", emotion: "警觉", shotType: "close_up", cameraAngle: "eye_level", frameType: "reaction", rhythm: "slow", visualAsset: "square_left", layoutIntent: "focus", voices: [voice(LIN, "林舟", "有人上来了。", "内心、骤然警觉", "thought")] },
        { scene: "楼梯间", beat: "转场", characters: [], coreAction: "楼梯门缝透出一道白光", emotion: "悬念", shotType: "wide", cameraAngle: "dutch_angle", frameType: "transition", rhythm: "transition", visualAsset: "landscape_right", layoutIntent: "transition", caption: "咔哒。" },
      ],
    }],
  },
  {
    groupId: "FIX-V02",
    title: "条漫双人连续对话",
    variants: [{
      variantId: "fix-v02-vertical",
      title: "便利店里的交替追问",
      format: "vertical_scroll",
      coverageTags: ["two_character_dialogue", "alternating_speakers", "reading_order", "tails"],
      targetNarrativeGroups: [[1, 2], [3, 4], [5, 6], [7, 8]],
      shots: [
        { scene: "便利店", beat: "试探", characters: [LIN, XU], coreAction: "两人隔着货架对视", emotion: "戒备", shotType: "wide", cameraAngle: "eye_level", frameType: "dialogue", rhythm: "normal", visualAsset: "landscape_pair_edges", layoutIntent: "wide", voices: [voice(XU, "许澄", "你迟到了十一分钟。", "冷静、直接")] },
        { scene: "便利店", beat: "试探", characters: [LIN], coreAction: "林舟把湿伞靠在门边", emotion: "克制", shotType: "medium", cameraAngle: "eye_level", frameType: "dialogue", rhythm: "normal", visualAsset: "portrait_left", layoutIntent: "standard", voices: [voice(LIN, "林舟", "后面有人跟着我。", "压低声音")] },
        { scene: "便利店", beat: "证据", characters: [XU], coreAction: "许澄推来一张存储卡", emotion: "紧张", shotType: "close_up", cameraAngle: "over_shoulder", frameType: "dialogue", rhythm: "normal", visualAsset: "square_right", layoutIntent: "standard", voices: [voice(XU, "许澄", "这里面有仓库的原始监控。", "快速、克制")] },
        { scene: "便利店", beat: "证据", characters: [LIN], coreAction: "林舟没有立刻伸手", emotion: "怀疑", shotType: "close_up", cameraAngle: "eye_level", frameType: "reaction", rhythm: "slow", visualAsset: "square_left", layoutIntent: "pause", voices: [voice(LIN, "林舟", "你为什么现在才给我？", "追问")] },
        { scene: "便利店", beat: "交换", characters: [XU], coreAction: "许澄攥紧红色文件夹", emotion: "愧疚", shotType: "medium", cameraAngle: "eye_level", frameType: "dialogue", rhythm: "normal", visualAsset: "portrait_right", layoutIntent: "standard", voices: [voice(XU, "许澄", "因为昨晚之前，我还以为他活着。", "发颤、压抑")] },
        { scene: "便利店", beat: "交换", characters: [LIN], coreAction: "林舟终于拿起存储卡", emotion: "沉重", shotType: "extreme_close_up", cameraAngle: "top_down", frameType: "detail", rhythm: "slow", visualAsset: "landscape_detail_bottom", layoutIntent: "detail", voices: [voice(LIN, "林舟", "我会查清楚。", "低沉")] },
        { scene: "便利店", beat: "警报", characters: [LIN, XU], coreAction: "门外车灯扫过玻璃", emotion: "惊惧", shotType: "wide", cameraAngle: "dutch_angle", frameType: "reaction", rhythm: "fast", visualAsset: "landscape_pair_edges", layoutIntent: "impact", voices: [voice(XU, "许澄", "不是我的车。", "急促")] },
        { scene: "便利店", beat: "警报", characters: [LIN], coreAction: "林舟拉低卷帘门", emotion: "果断", shotType: "full", cameraAngle: "low_angle", frameType: "action", rhythm: "impact", visualAsset: "tall_action", layoutIntent: "focus", voices: [voice(LIN, "林舟", "关灯，走后门！", "命令、急促", "shout")] },
      ],
    }],
  },
  {
    groupId: "FIX-V03",
    title: "条漫动作高潮",
    variants: [{
      variantId: "fix-v03-vertical",
      title: "旧港追逐与坠落",
      format: "vertical_scroll",
      coverageTags: ["action", "impact", "reaction", "detail", "focus_panel"],
      targetNarrativeGroups: [[1, 2], [3], [4], [5, 6], [7]],
      shots: [
        { scene: "旧港", beat: "追逐", characters: [LIN, ZHAO], coreAction: "两人冲过堆叠集装箱", emotion: "紧迫", shotType: "wide", cameraAngle: "high_angle", frameType: "action", rhythm: "fast", visualAsset: "landscape_pair_edges", layoutIntent: "wide", caption: "八码头东侧。" },
        { scene: "旧港", beat: "追逐", characters: [ZHAO], coreAction: "赵妍侧身躲开摆动吊钩", emotion: "专注", shotType: "full", cameraAngle: "dutch_angle", frameType: "action", rhythm: "fast", visualAsset: "tall_action", layoutIntent: "standard", voices: [voice(ZHAO, "赵妍", "别停！", "高声、急促", "shout")] },
        { scene: "旧港", beat: "失足", characters: [LIN], coreAction: "林舟脚下铁板断裂", emotion: "惊愕", shotType: "close_up", cameraAngle: "top_down", frameType: "action", rhythm: "impact", visualAsset: "square_center", layoutIntent: "impact" },
        { scene: "旧港", beat: "失足", characters: [LIN, ZHAO], coreAction: "赵妍抓住林舟手腕", emotion: "爆发", shotType: "full", cameraAngle: "low_angle", frameType: "action", rhythm: "impact", visualAsset: "portrait_pair", layoutIntent: "focus", voices: [voice(ZHAO, "赵妍", "抓紧我！", "爆发、喊叫", "shout")] },
        { scene: "旧港", beat: "反击", characters: [], coreAction: "存储卡从口袋滑出", emotion: "危险", shotType: "extreme_close_up", cameraAngle: "top_down", frameType: "detail", rhythm: "fast", visualAsset: "landscape_detail_bottom", layoutIntent: "detail" },
        { scene: "旧港", beat: "反击", characters: [LIN], coreAction: "林舟另一只手抓住铁链", emotion: "决绝", shotType: "close_up", cameraAngle: "dutch_angle", frameType: "action", rhythm: "impact", visualAsset: "square_left", layoutIntent: "impact", voices: [voice(LIN, "林舟", "先拿卡！", "咬牙喊出", "shout")] },
        { scene: "旧港", beat: "余波", characters: [ZHAO], coreAction: "赵妍看见远处警灯", emotion: "短暂松弛", shotType: "medium", cameraAngle: "eye_level", frameType: "reaction", rhythm: "slow", visualAsset: "portrait_right", layoutIntent: "pause", caption: "远处终于响起警笛。" },
      ],
    }],
  },
  {
    groupId: "FIX-V04",
    title: "条漫多场景转场",
    variants: [{
      variantId: "fix-v04-vertical",
      title: "三处地点的并行线索",
      format: "vertical_scroll",
      coverageTags: ["multi_scene", "atmosphere", "transition", "scene_spacing", "slice_boundary"],
      targetNarrativeGroups: [[1, 2], [3, 4], [5], [6, 7], [8]],
      shots: [
        { scene: "旧港", beat: "港口线", characters: [], coreAction: "雨水漫过废弃轨道", emotion: "压抑", shotType: "establishing", cameraAngle: "high_angle", frameType: "atmosphere", rhythm: "slow", visualAsset: "wide_environment", layoutIntent: "wide", caption: "同一时间，旧港。" },
        { scene: "旧港", beat: "港口线", characters: [GAO], coreAction: "高远撕下旧工牌背面的纸条", emotion: "恐惧", shotType: "extreme_close_up", cameraAngle: "top_down", frameType: "detail", rhythm: "normal", visualAsset: "landscape_detail_bottom", layoutIntent: "detail", voices: [voice(GAO, "高远", "他们提前来了。", "自言自语、发颤")] },
        { scene: "档案室", beat: "档案线", characters: [], coreAction: "走廊灯逐盏熄灭", emotion: "不安", shotType: "wide", cameraAngle: "eye_level", frameType: "transition", rhythm: "transition", visualAsset: "landscape_right", layoutIntent: "transition", caption: "市档案馆。" },
        { scene: "档案室", beat: "档案线", characters: [XU], coreAction: "许澄抱着文件夹躲进柜后", emotion: "紧张", shotType: "medium", cameraAngle: "over_shoulder", frameType: "reaction", rhythm: "normal", visualAsset: "portrait_right", layoutIntent: "standard", voices: [voice(XU, "许澄", "林舟，你最好已经看到那段录像。", "耳语")] },
        { scene: "城市高架", beat: "追踪线", characters: [], coreAction: "黑色轿车穿过积水", emotion: "迫近", shotType: "establishing", cameraAngle: "high_angle", frameType: "transition", rhythm: "transition", visualAsset: "wide_environment", layoutIntent: "wide", caption: "城北高架，距离档案馆三公里。" },
        { scene: "城市高架", beat: "追踪线", characters: [ZHAO], coreAction: "赵妍在副驾驶查看定位", emotion: "焦急", shotType: "close_up", cameraAngle: "eye_level", frameType: "dialogue", rhythm: "fast", visualAsset: "square_center", layoutIntent: "standard", voices: [voice(ZHAO, "赵妍", "信号刚刚消失。", "快速汇报")] },
        { scene: "城市高架", beat: "追踪线", characters: [ZHAO], coreAction: "赵妍抬头看见出口标志", emotion: "果断", shotType: "medium", cameraAngle: "low_angle", frameType: "action", rhythm: "fast", visualAsset: "portrait_left", layoutIntent: "focus", voices: [voice(ZHAO, "赵妍", "下一个出口，去档案馆！", "命令、急促", "shout")] },
        { scene: "档案室", beat: "汇合钩子", characters: [], coreAction: "档案室门把手缓慢转动", emotion: "悬念", shotType: "extreme_close_up", cameraAngle: "eye_level", frameType: "transition", rhythm: "impact", visualAsset: "square_right", layoutIntent: "impact", caption: "咔。" },
      ],
    }],
  },
  {
    groupId: "FIX-P01",
    title: "页漫双人对话",
    variants: [{
      variantId: "fix-p01-paged",
      title: "审讯室里的三轮交锋",
      format: "paged_comic",
      coverageTags: ["paged_dialogue", "three_to_six_panels", "exchange_page_boundary"],
      targetNarrativeGroups: [[1, 2, 3], [4, 5, 6]],
      shots: [
        { scene: "审讯室", beat: "开场", characters: [LIN, GAO], coreAction: "两人隔桌而坐", emotion: "压迫", shotType: "wide", cameraAngle: "eye_level", frameType: "dialogue", rhythm: "slow", visualAsset: "landscape_pair_edges", layoutIntent: "wide", voices: [voice(LIN, "林舟", "我们从七码头那晚开始。", "平静、施压")] },
        { scene: "审讯室", beat: "开场", characters: [GAO], coreAction: "高远避开林舟视线", emotion: "防御", shotType: "close_up", cameraAngle: "eye_level", frameType: "reaction", rhythm: "normal", visualAsset: "square_right", layoutIntent: "standard", voices: [voice(GAO, "高远", "我那天没有值班。", "生硬")] },
        { scene: "审讯室", beat: "证据", characters: [LIN], coreAction: "林舟按下录音笔播放键", emotion: "笃定", shotType: "extreme_close_up", cameraAngle: "top_down", frameType: "detail", rhythm: "normal", visualAsset: "landscape_detail_bottom", layoutIntent: "detail", voices: [voice(LIN, "林舟", "可你的声音在这里。", "直接")] },
        { scene: "审讯室", beat: "证据", characters: [GAO], coreAction: "高远猛地抬头", emotion: "惊慌", shotType: "close_up", cameraAngle: "low_angle", frameType: "reaction", rhythm: "impact", visualAsset: "square_left", layoutIntent: "impact", voices: [voice(GAO, "高远", "那不是完整录音！", "失控喊叫", "shout")] },
        { scene: "审讯室", beat: "突破", characters: [LIN], coreAction: "林舟停掉录音", emotion: "冷静", shotType: "medium", cameraAngle: "eye_level", frameType: "dialogue", rhythm: "slow", visualAsset: "portrait_left", layoutIntent: "standard", voices: [voice(LIN, "林舟", "那你告诉我缺了哪一段。", "放慢语速")] },
        { scene: "审讯室", beat: "突破", characters: [GAO], coreAction: "高远双手捂住脸", emotion: "崩溃", shotType: "medium", cameraAngle: "high_angle", frameType: "reaction", rhythm: "slow", visualAsset: "portrait_center", layoutIntent: "focus", voices: [voice(GAO, "高远", "他们把船开进来时，赵妍已经在仓库里了。", "崩溃、低声")] },
      ],
    }],
  },
  {
    groupId: "FIX-P02",
    title: "页漫多人对话",
    variants: [{
      variantId: "fix-p02-paged",
      title: "仓库里的多人争执",
      format: "paged_comic",
      coverageTags: ["group_dialogue", "unknown_speaker", "balloon_density", "fallback_tail"],
      targetNarrativeGroups: [[1, 2, 3, 4], [5]],
      shots: [
        { scene: "仓库", beat: "对峙", characters: [LIN, XU, ZHAO, GAO], coreAction: "四人围在投影屏前", emotion: "紧绷", shotType: "wide", cameraAngle: "eye_level", frameType: "dialogue", rhythm: "normal", visualAsset: "landscape_group", layoutIntent: "wide", voices: [voice(ZHAO, "赵妍", "录像只能说明有人进过仓库。", "冷静分析"), voice(GAO, "高远", "那艘船才是关键！", "急切", "shout")] },
        { scene: "仓库", beat: "对峙", characters: [LIN, XU], coreAction: "林舟与许澄交换眼神", emotion: "怀疑", shotType: "medium", cameraAngle: "over_shoulder", frameType: "dialogue", rhythm: "normal", visualAsset: "portrait_pair", layoutIntent: "standard", voices: [voice(LIN, "林舟", "许澄，你还瞒了什么？", "追问"), voice(XU, "许澄", "一份没有入库的乘员名单。", "迟疑")] },
        { scene: "仓库", beat: "干扰", characters: [LIN, XU, ZHAO, GAO], coreAction: "仓库外传来金属撞击声", emotion: "惊疑", shotType: "wide", cameraAngle: "dutch_angle", frameType: "reaction", rhythm: "fast", visualAsset: "landscape_pair_edges", layoutIntent: "standard", voices: [voice(null, "门外声音", "里面的人，别动。", "隔门、无法确认身份")] },
        { scene: "仓库", beat: "决定", characters: [ZHAO, GAO], coreAction: "赵妍关掉投影并示意散开", emotion: "果断", shotType: "medium", cameraAngle: "low_angle", frameType: "action", rhythm: "fast", visualAsset: "portrait_pair", layoutIntent: "standard", voices: [voice(ZHAO, "赵妍", "高远守后门，其他人跟我走。", "命令") ] },
        { scene: "仓库", beat: "钩子", characters: [XU], coreAction: "许澄发现投影仍在自动播放", emotion: "恐惧", shotType: "close_up", cameraAngle: "eye_level", frameType: "reaction", rhythm: "impact", visualAsset: "square_right", layoutIntent: "focus", voices: [voice(XU, "许澄", "等等，这不是我们刚才的画面。", "压低声音、惊恐")] },
      ],
    }],
  },
  {
    groupId: "FIX-P03",
    title: "页漫动作与细节",
    variants: [{
      variantId: "fix-p03-paged",
      title: "仓库爆破前后的动作页",
      format: "paged_comic",
      coverageTags: ["action_focus", "reaction", "detail", "page_turn_impact"],
      targetNarrativeGroups: [[1, 2, 3], [4, 5, 6, 7]],
      shots: [
        { scene: "仓库", beat: "潜入", characters: [ZHAO], coreAction: "赵妍贴墙进入仓库", emotion: "专注", shotType: "full", cameraAngle: "low_angle", frameType: "action", rhythm: "normal", visualAsset: "tall_action", layoutIntent: "standard" },
        { scene: "仓库", beat: "潜入", characters: [], coreAction: "门框下方压着细线", emotion: "危险", shotType: "extreme_close_up", cameraAngle: "top_down", frameType: "detail", rhythm: "slow", visualAsset: "landscape_detail_bottom", layoutIntent: "detail" },
        { scene: "仓库", beat: "发现", characters: [ZHAO], coreAction: "赵妍的瞳孔骤然收紧", emotion: "惊觉", shotType: "extreme_close_up", cameraAngle: "eye_level", frameType: "reaction", rhythm: "impact", visualAsset: "square_center", layoutIntent: "impact", voices: [voice(ZHAO, "赵妍", "趴下！", "爆发喊叫", "shout")] },
        { scene: "仓库", beat: "爆破", characters: [LIN, XU, ZHAO], coreAction: "冲击波掀翻木箱", emotion: "爆发", shotType: "wide", cameraAngle: "dutch_angle", frameType: "action", rhythm: "impact", visualAsset: "wide_group_edges", layoutIntent: "focus" },
        { scene: "仓库", beat: "爆破", characters: [LIN], coreAction: "林舟用身体护住存储卡", emotion: "决绝", shotType: "medium", cameraAngle: "high_angle", frameType: "action", rhythm: "fast", visualAsset: "portrait_left", layoutIntent: "standard" },
        { scene: "仓库", beat: "余波", characters: [XU], coreAction: "许澄从烟尘中伸出手", emotion: "痛苦", shotType: "close_up", cameraAngle: "eye_level", frameType: "reaction", rhythm: "slow", visualAsset: "square_right", layoutIntent: "standard", voices: [voice(XU, "许澄", "名单……还在我这里。", "虚弱")] },
        { scene: "仓库外", beat: "页尾", characters: [], coreAction: "一双陌生鞋停在破门外", emotion: "威胁", shotType: "extreme_close_up", cameraAngle: "low_angle", frameType: "transition", rhythm: "impact", visualAsset: "landscape_detail_bottom", layoutIntent: "detail", caption: "烟尘之外，有人没有离开。" },
      ],
    }],
  },
  {
    groupId: "FIX-P04",
    title: "页漫长对白与旁白",
    variants: [{
      variantId: "fix-p04-paged",
      title: "证词与回忆交错的长对白",
      format: "paged_comic",
      coverageTags: ["long_dialogue", "caption", "text_fit", "minimum_font_size"],
      targetNarrativeGroups: [[1, 2], [3, 4]],
      shots: [
        { scene: "病房", beat: "证词", characters: [GAO], coreAction: "高远望着窗外的雨", emotion: "疲惫", shotType: "medium", cameraAngle: "eye_level", frameType: "dialogue", rhythm: "slow", visualAsset: "portrait_right", layoutIntent: "standard", caption: "高远的证词，从一场看似普通的换班开始。", voices: [voice(GAO, "高远", "那天我本来应该在七码头值夜班，可调度室临时收到一张没有署名的换班单，上面写着让我去旧仓库检查一批已经报废的救生设备。", "缓慢、回忆")] },
        { scene: "旧仓库回忆", beat: "证词", characters: [GAO], coreAction: "年轻的高远推开旧仓库门", emotion: "不安", shotType: "wide", cameraAngle: "over_shoulder", frameType: "atmosphere", rhythm: "slow", visualAsset: "wide_environment", layoutIntent: "wide", caption: "他没有注意到，门锁刚被人换过。", voices: [voice(GAO, "高远", "仓库里没有救生设备，只有一艘拆掉编号的小艇，还有三个人在搬没有登记的木箱。", "压低声音、连续叙述")] },
        { scene: "病房", beat: "追问", characters: [LIN, GAO], coreAction: "林舟把照片放到床边", emotion: "克制", shotType: "medium", cameraAngle: "over_shoulder", frameType: "dialogue", rhythm: "normal", visualAsset: "portrait_pair", layoutIntent: "standard", voices: [voice(LIN, "林舟", "你说看不清他们的脸，可这张照片里，你正对着其中一个人。请你再想一次，他有没有叫过别人的名字？", "清晰、追问"), voice(GAO, "高远", "有。他叫了一声‘赵队’，但我不知道是不是赵妍，也可能只是同姓。", "迟疑、辩解")] },
        { scene: "病房", beat: "突破", characters: [GAO], coreAction: "高远终于转过头", emotion: "恐惧", shotType: "close_up", cameraAngle: "eye_level", frameType: "reaction", rhythm: "impact", visualAsset: "square_left", layoutIntent: "focus", caption: "沉默持续了整整十秒。", voices: [voice(GAO, "高远", "我记得那个人的右手。他少了一截小指，而且一直戴着一枚黑色戒指。", "颤抖、确认")] },
      ],
    }],
  },
  {
    groupId: "FIX-X01",
    title: "两种格式的无对白章节",
    variants: [
      {
        variantId: "fix-x01-vertical",
        title: "无对白潜入（条漫）",
        format: "vertical_scroll",
        coverageTags: ["silent_chapter", "no_false_balloon", "visual_rhythm", "vertical"],
        targetNarrativeGroups: [[1], [2, 3], [4], [5]],
        shots: [
          { scene: "档案馆", beat: "进入", characters: [], coreAction: "夜色中的档案馆外墙", emotion: "静谧", shotType: "establishing", cameraAngle: "high_angle", frameType: "atmosphere", rhythm: "slow", visualAsset: "wide_environment", layoutIntent: "wide" },
          { scene: "档案馆", beat: "进入", characters: [LIN], coreAction: "林舟从侧窗翻入", emotion: "谨慎", shotType: "full", cameraAngle: "low_angle", frameType: "action", rhythm: "normal", visualAsset: "tall_action", layoutIntent: "standard" },
          { scene: "档案馆", beat: "搜寻", characters: [], coreAction: "手套拨开布满灰尘的档案盒", emotion: "专注", shotType: "extreme_close_up", cameraAngle: "top_down", frameType: "detail", rhythm: "slow", visualAsset: "landscape_detail_bottom", layoutIntent: "detail" },
          { scene: "档案馆", beat: "搜寻", characters: [LIN], coreAction: "林舟在手电光中找到空缺编号", emotion: "警觉", shotType: "close_up", cameraAngle: "eye_level", frameType: "reaction", rhythm: "slow", visualAsset: "square_left", layoutIntent: "standard" },
          { scene: "档案馆", beat: "钩子", characters: [], coreAction: "远处监控红灯亮起", emotion: "危险", shotType: "extreme_close_up", cameraAngle: "eye_level", frameType: "transition", rhythm: "impact", visualAsset: "square_right", layoutIntent: "impact" },
        ],
      },
      {
        variantId: "fix-x01-paged",
        title: "无对白潜入（页漫）",
        format: "paged_comic",
        coverageTags: ["silent_chapter", "no_false_balloon", "visual_rhythm", "paged"],
        targetNarrativeGroups: [[1, 2, 3, 4], [5]],
        shots: [
          { scene: "档案馆", beat: "进入", characters: [], coreAction: "夜色中的档案馆外墙", emotion: "静谧", shotType: "establishing", cameraAngle: "high_angle", frameType: "atmosphere", rhythm: "slow", visualAsset: "wide_environment", layoutIntent: "wide" },
          { scene: "档案馆", beat: "进入", characters: [LIN], coreAction: "林舟从侧窗翻入", emotion: "谨慎", shotType: "full", cameraAngle: "low_angle", frameType: "action", rhythm: "normal", visualAsset: "tall_action", layoutIntent: "standard" },
          { scene: "档案馆", beat: "搜寻", characters: [], coreAction: "手套拨开布满灰尘的档案盒", emotion: "专注", shotType: "extreme_close_up", cameraAngle: "top_down", frameType: "detail", rhythm: "slow", visualAsset: "landscape_detail_bottom", layoutIntent: "detail" },
          { scene: "档案馆", beat: "搜寻", characters: [LIN], coreAction: "林舟在手电光中找到空缺编号", emotion: "警觉", shotType: "close_up", cameraAngle: "eye_level", frameType: "reaction", rhythm: "slow", visualAsset: "square_left", layoutIntent: "standard" },
          { scene: "档案馆", beat: "钩子", characters: [], coreAction: "远处监控红灯亮起", emotion: "危险", shotType: "extreme_close_up", cameraAngle: "eye_level", frameType: "transition", rhythm: "impact", visualAsset: "square_right", layoutIntent: "focus" },
        ],
      },
    ],
  },
  {
    groupId: "FIX-X02",
    title: "两种格式的来源更新",
    variants: [
      {
        variantId: "fix-x02-vertical",
        title: "定稿图替换（条漫）",
        format: "vertical_scroll",
        coverageTags: ["source_replacement", "preserve_crop", "preserve_text", "historical_export", "vertical"],
        targetNarrativeGroups: [[1, 2], [3], [4]],
        replacementAtOrder: 2,
        replacementAsset: "portrait_replacement",
        shots: [
          { scene: "车站", beat: "会面", characters: [LIN], coreAction: "林舟站在末班车站台", emotion: "等待", shotType: "wide", cameraAngle: "eye_level", frameType: "atmosphere", rhythm: "slow", visualAsset: "landscape_left", layoutIntent: "wide", caption: "末班车已经离站。" },
          { scene: "车站", beat: "会面", characters: [XU], coreAction: "许澄从柱后走出", emotion: "疲惫", shotType: "medium", cameraAngle: "eye_level", frameType: "dialogue", rhythm: "normal", visualAsset: "portrait_right", layoutIntent: "standard", voices: [voice(XU, "许澄", "名单不在存储卡里。", "低声")] },
          { scene: "车站", beat: "线索", characters: [LIN], coreAction: "林舟看向空轨道", emotion: "疑惑", shotType: "close_up", cameraAngle: "eye_level", frameType: "reaction", rhythm: "slow", visualAsset: "square_left", layoutIntent: "standard", voices: [voice(LIN, "林舟", "那它在哪里？", "追问")] },
          { scene: "车站", beat: "线索", characters: [XU], coreAction: "许澄指向站台时刻表背面", emotion: "坚定", shotType: "extreme_close_up", cameraAngle: "over_shoulder", frameType: "detail", rhythm: "impact", visualAsset: "landscape_detail_bottom", layoutIntent: "focus", voices: [voice(XU, "许澄", "一直都在所有人看得见的地方。", "确认")] },
        ],
      },
      {
        variantId: "fix-x02-paged",
        title: "定稿图替换（页漫）",
        format: "paged_comic",
        coverageTags: ["source_replacement", "preserve_crop", "preserve_text", "historical_export", "paged"],
        targetNarrativeGroups: [[1, 2, 3, 4]],
        replacementAtOrder: 2,
        replacementAsset: "portrait_replacement",
        shots: [
          { scene: "车站", beat: "会面", characters: [LIN], coreAction: "林舟站在末班车站台", emotion: "等待", shotType: "wide", cameraAngle: "eye_level", frameType: "atmosphere", rhythm: "slow", visualAsset: "landscape_left", layoutIntent: "standard", caption: "末班车已经离站。" },
          { scene: "车站", beat: "会面", characters: [XU], coreAction: "许澄从柱后走出", emotion: "疲惫", shotType: "medium", cameraAngle: "eye_level", frameType: "dialogue", rhythm: "normal", visualAsset: "portrait_right", layoutIntent: "standard", voices: [voice(XU, "许澄", "名单不在存储卡里。", "低声")] },
          { scene: "车站", beat: "线索", characters: [LIN], coreAction: "林舟看向空轨道", emotion: "疑惑", shotType: "close_up", cameraAngle: "eye_level", frameType: "reaction", rhythm: "slow", visualAsset: "square_left", layoutIntent: "standard", voices: [voice(LIN, "林舟", "那它在哪里？", "追问")] },
          { scene: "车站", beat: "线索", characters: [XU], coreAction: "许澄指向站台时刻表背面", emotion: "坚定", shotType: "extreme_close_up", cameraAngle: "over_shoulder", frameType: "detail", rhythm: "impact", visualAsset: "landscape_detail_bottom", layoutIntent: "standard", voices: [voice(XU, "许澄", "一直都在所有人看得见的地方。", "确认")] },
        ],
      },
    ],
  },
];
