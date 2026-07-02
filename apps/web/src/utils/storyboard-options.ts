/**
 * 分镜镜头选项字典(从 StoryboardWorkspace.vue 抽出)。
 *
 * 纯常量,供分镜工作台行内编辑下拉使用。见前端大文件拆分轮次2。
 */
export interface ShotSelectOption {
  value: string;
  label: string;
}

export const SHOT_TYPE_OPTIONS: ShotSelectOption[] = [
  { value: "establishing", label: "建立镜头" },
  { value: "wide", label: "远景" },
  { value: "full", label: "全景" },
  { value: "medium", label: "中景" },
  { value: "close_up", label: "特写" },
  { value: "extreme_close_up", label: "大特写" },
];

export const CAMERA_ANGLE_OPTIONS: ShotSelectOption[] = [
  { value: "eye_level", label: "平视" },
  { value: "high_angle", label: "俯拍" },
  { value: "low_angle", label: "仰拍" },
  { value: "over_shoulder", label: "过肩" },
  { value: "top_down", label: "顶视" },
  { value: "dutch_angle", label: "荷兰角" },
];

export const PANEL_RHYTHM_OPTIONS: ShotSelectOption[] = [
  { value: "slow", label: "慢节奏" },
  { value: "normal", label: "常规" },
  { value: "fast", label: "快节奏" },
  { value: "impact", label: "冲击格" },
  { value: "transition", label: "过渡格" },
];

export const CAMERA_MOVEMENT_OPTIONS: ShotSelectOption[] = [
  { value: "static", label: "固定不动" },
  { value: "push_in", label: "推进" },
  { value: "pull_out", label: "拉远" },
  { value: "pan_left", label: "向左横摇" },
  { value: "pan_right", label: "向右横摇" },
  { value: "tilt_up", label: "向上摇" },
  { value: "tilt_down", label: "向下摇" },
  { value: "track_left", label: "向左跟拍" },
  { value: "track_right", label: "向右跟拍" },
  { value: "slow_zoom", label: "缓慢变焦" },
  { value: "handheld", label: "手持感" },
  { value: "none", label: "不指定" },
];

export const FRAME_TYPE_OPTIONS: ShotSelectOption[] = [
  { value: "atmosphere", label: "氛围镜头" },
  { value: "dialogue", label: "对话镜头" },
  { value: "action", label: "动作镜头" },
  { value: "reaction", label: "反应镜头" },
  { value: "detail", label: "细节镜头" },
  { value: "transition", label: "过渡镜头" },
];
