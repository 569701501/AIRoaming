import {
  parseChapterScriptMarkdownV1,
  type StoryStructureJson,
} from "@airoaming/shared";

export interface StoryboardDialogueCandidate {
  localRef: string;
  sceneOrder: number;
  sceneName: string;
  sceneRef: string | null;
  sourceSpeaker: string;
  characterRef: string | null;
  sourceKind: "dialogue" | "narration" | "quoted_audio";
  line: string;
}

export interface StoryboardDialogueReference {
  available: boolean;
  candidates: StoryboardDialogueCandidate[];
}

const OUTER_QUOTE_PAIRS = new Map([
  ["“", "”"],
  ["「", "」"],
  ["『", "』"],
  ["\"", "\""],
  ["‘", "’"],
  ["'", "'"],
]);

function stripOuterQuotes(value: string): string {
  let result = value.trim();
  while (result.length >= 2) {
    const expectedEnd = OUTER_QUOTE_PAIRS.get(result[0] ?? "");
    if (!expectedEnd || !result.endsWith(expectedEnd)) break;
    result = result.slice(1, -expectedEnd.length).trim();
  }
  return result;
}

function stripLeadingPerformanceDirections(value: string): string {
  let result = value.trim();
  while (result) {
    const match = result.match(/^(?:（[^）\r\n]+）|\([^)\r\n]+\))\s*/u);
    if (!match) break;
    const spokenText = result.slice(match[0].length).trim();
    if (!spokenText) break;
    result = spokenText;
  }
  return result;
}

function resolveCharacterRef(
  sourceSpeaker: string,
  characters: StoryStructureJson["characters"],
): string | null {
  const exact = characters.find((character) => character.name.trim() === sourceSpeaker);
  if (exact) return exact.id;
  const contained = characters
    .filter((character) => {
      const name = character.name.trim();
      return Boolean(name) && sourceSpeaker.includes(name);
    })
    .sort((left, right) => right.name.trim().length - left.name.trim().length)[0];
  return contained?.id ?? null;
}

/**
 * 从精确正式章节 Markdown 编译只读对白候选。
 * 解析失败代表历史/非固定正文，只关闭新增来源硬门，不影响既有分镜流程。
 */
export function buildStoryboardDialogueReference(
  sourceText: string,
  structure: Pick<StoryStructureJson, "characters" | "scenes">,
): StoryboardDialogueReference {
  let document;
  try {
    document = parseChapterScriptMarkdownV1(sourceText);
  } catch {
    return { available: false, candidates: [] };
  }

  const candidates: StoryboardDialogueCandidate[] = [];
  document.scenes.forEach((scene) => {
    const sceneRef = structure.scenes.find((item) => item.name.trim() === scene.name.trim())?.id
      ?? structure.scenes[scene.order - 1]?.id
      ?? null;
    const appendCandidate = (input: {
      sourceSpeaker: string;
      characterRef: string | null;
      sourceKind: StoryboardDialogueCandidate["sourceKind"];
      line: string;
    }): void => {
      candidates.push({
        localRef: `dialogue-${String(candidates.length + 1).padStart(4, "0")}`,
        sceneOrder: scene.order,
        sceneName: scene.name,
        sceneRef,
        ...input,
      });
    };

    scene.dialogue.split(/\r?\n/u).forEach((rawLine) => {
      const sourceLine = rawLine.trim();
      if (!sourceLine || /^(?:无|原稿未明确)$/u.test(sourceLine)) return;
      const match = sourceLine.match(/^(.+?)[：:]\s*(.+)$/u);
      if (!match) return;
      const sourceSpeaker = match[1]?.trim() ?? "";
      const line = stripOuterQuotes(stripLeadingPerformanceDirections(match[2] ?? ""));
      if (!sourceSpeaker || !line) return;
      appendCandidate({
        sourceSpeaker,
        characterRef: resolveCharacterRef(sourceSpeaker, structure.characters),
        sourceKind: "dialogue",
        line,
      });
    });

    scene.narration.split(/\r?\n/u).forEach((rawLine) => {
      const line = stripOuterQuotes(rawLine);
      if (!line || /^(?:无|原稿未明确)$/u.test(line)) return;
      appendCandidate({ sourceSpeaker: "旁白", characterRef: null, sourceKind: "narration", line });
    });

    [scene.description, scene.actions, scene.endingPoint].forEach((sourceField) => {
      const quotePattern = /“([^”]+)”|「([^」]+)」|『([^』]+)』|"([^"]+)"/gu;
      for (const match of sourceField.matchAll(quotePattern)) {
        const line = (match[1] ?? match[2] ?? match[3] ?? match[4] ?? "").trim();
        if (!line) continue;
        const before = sourceField.slice(Math.max(0, (match.index ?? 0) - 64), match.index ?? 0);
        if (!/(?:广播|声音|说|喊|问|低语|录音|提示音?|对讲机|喇叭|响起)/u.test(before)) continue;
        const sourceSpeaker = before.includes("广播")
          ? "广播"
          : before.includes("录音")
            ? "录音"
            : before.includes("对讲机")
              ? "对讲机"
              : "原文声音";
        appendCandidate({ sourceSpeaker, characterRef: null, sourceKind: "quoted_audio", line });
      }
    });
  });

  return { available: true, candidates };
}
