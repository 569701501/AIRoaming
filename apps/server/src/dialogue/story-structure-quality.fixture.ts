import type { StoryStructureJson } from "@airoaming/shared";

export function buildValidStoryStructure(): StoryStructureJson {
  const now = "2026-07-16T00:00:00.000Z";
  return {
    schemaVersion: 1,
    chapterId: "chapter-1",
    chapterTitle: "拍卖夜",
    sourceScriptVersionId: "script-v1",
    synopsis: "林夏潜入记忆拍卖会夺回母亲的记忆瓶，并发现主持人是失踪多年的父亲。",
    direction: {
      logline: "林夏闯入记忆拍卖会，却发现主持人使用着父亲的身份。",
      chapterGoal: "夺回母亲的记忆瓶。",
      coreConflict: "行动会暴露作为内应的周默。",
      emotionalArc: "从压抑潜入走向身份揭示后的震惊。",
      endingHook: "父亲留下通往地下金库的钥匙。",
    },
    characters: [
      { id: "character-1", projectCharacterId: null, name: "林夏", role: "潜入者", level: "lead", entityType: "human", motivation: "夺回母亲的记忆", relationship: "与周默合作", visualTraits: "", notes: "" },
      { id: "character-2", projectCharacterId: null, name: "周默", role: "内应", level: "recurring", entityType: "human", motivation: "掩护林夏", relationship: "林夏的协助者", visualTraits: "", notes: "" },
      { id: "character-3", projectCharacterId: null, name: "主持人", role: "拍卖主持者", level: "chapter", entityType: "human", motivation: "主持竞拍", relationship: "真实身份与林夏有关", visualTraits: "面具", notes: "" },
      { id: "character-4", projectCharacterId: null, name: "买家", role: "竞拍群体", level: "extra", entityType: "group", motivation: "竞拍记忆", relationship: "拍卖参与者", visualTraits: "", notes: "" },
    ],
    scenes: [
      { id: "scene-1", name: "拍卖会外墙", location: "旧商场外墙", timeOfDay: "雨夜", atmosphere: "急促而隐秘", purpose: "让林夏在周默掩护下潜入拍卖厅" },
      { id: "scene-2", name: "记忆拍卖厅", location: "旧商场中庭", timeOfDay: "同夜", atmosphere: "华丽而压迫", purpose: "让林夏夺取记忆瓶并揭示主持人身份" },
    ],
    beats: [
      { id: "beat-1", order: 1, title: "雨夜潜入", summary: "林夏沿外墙攀爬并进入通风窗。", conflict: "周默只能争取三分钟。", characters: ["林夏", "周默"], sceneId: "scene-1", visualFocus: "雨夜外墙与熄灭的探照灯", outcome: "林夏落到拍卖厅上方钢梁。" },
      { id: "beat-2", order: 2, title: "夺取记忆瓶", summary: "林夏降到展台夺取母亲的记忆瓶。", conflict: "竞拍现场因她的行动陷入混乱。", characters: ["林夏", "主持人", "买家"], sceneId: "scene-2", visualFocus: "暖金记忆瓶与冷蓝霓虹", outcome: "主持人在混乱中摘下面具。" },
      { id: "beat-3", order: 3, title: "父亲现身", summary: "林夏认出主持人是失踪多年的父亲。", conflict: "父亲仍站在典当行一方。", characters: ["林夏", "主持人"], sceneId: "scene-2", visualFocus: "面具落下和脚边的金属钥匙", outcome: "父亲把地下金库钥匙交给林夏。" },
    ],
    notes: "后续分镜保留记忆瓶的冷暖色对比。",
    createdAt: now,
    updatedAt: now,
  };
}
