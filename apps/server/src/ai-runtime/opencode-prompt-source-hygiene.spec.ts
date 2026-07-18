import { readFileSync } from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const SOURCE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REPOSITORY_ROOT = path.resolve(SOURCE_ROOT, "../../..");

function source(relativePath: string): string {
  return readFileSync(path.resolve(REPOSITORY_ROOT, relativePath), "utf8");
}

describe("OpenCodeAI Prompt 单一事实源", () => {
  it("已迁移的稳定创作正文不会回流到生产 TypeScript", () => {
    const checks: Array<{ file: string; forbidden: string[] }> = [
      {
        file: "apps/server/src/projects/persistent-task-worker.service.ts",
        forbidden: [
          "请把下面章节剧本转换为严格的 StoryDocumentV2 JSON",
          "请根据下面 StoryDocumentV2",
          "生成严格的 StoryboardDocumentV2 JSON",
        ],
      },
      {
        file: "apps/server/src/projects/image-provider.service.ts",
        forbidden: ["supplies character identity only", "参考图职责", "References do not override"],
      },
      {
        file: "apps/server/src/dialogue/dialogue-prompt.util.ts",
        forbidden: [
          "每个候选都要能看出反差、情绪钩子、主角压力",
          "三个候选必须在主角承受的核心压力",
          "终章的下一章衔接必须明确标记故事已经收束",
          "P3 场景推进：每场戏都要有有效剧情描写",
          "当前章节卡的章节目标、核心冲突、关键转折和结尾钩子必须在正文中可观察",
          "任务：根据用户选中的灵感种子，生成第 1 章完整「章节剧本」",
          "先在内部列出“允许修改 / 必须保护”",
          "尊重当前草稿中的既有事实和剧情方向",
          "正式章节正文是本阶段唯一的实际剧情事实源",
          "每一个正文场景都必须且只能对应一个场景卡",
          "上一次输出格式可解析，但未通过剧情结构固定质量门",
          "漫画画格锁定一个静态决定性瞬间",
          "漫剧镜头从开始状态",
          "给后续图片提示词生成的简短草稿",
          "你是来源分析员，不是改编作者",
          "标签、录音、屏幕文字、档案内容、书信或广播",
          "你只能审计，不能继续改写章节正文",
          "sourceCoverage 必须完整、无重叠覆盖",
          "只修复格式、字段、引用和结构错误",
        ],
      },
      {
        file: "apps/server/src/dialogue/script-dialogue.service.ts",
        forbidden: [
          "上一次输出格式合法，但未通过 P1 灵感质量门",
          "请根据问题代码重新生成完整 3 项",
          "上一次输出格式合法，但未通过 P2 因果大纲与结局方向质量门",
          "上一次输出格式合法，但未通过 P3 场景契约 / P5 连续性质量门",
          "每场戏要有有效剧情描写、人物动作、阻力或选择",
          "上一次输出未通过 P5 前章连续性保护",
          "上一次章节改写未通过 creative.chapter-edit/1.0 格式校验",
        ],
      },
      {
        file: "apps/server/src/dialogue/script-revision-quality.util.ts",
        forbidden: [
          "只调整场景目标、阻力、节奏、潜台词、转折及其文字表达",
          "必须保留全部剧情事实和场景结构",
        ],
      },
      {
        file: "apps/server/src/projects/project-domain.util.ts",
        forbidden: ["dark cinematic comic realism", "semi-realistic comic illustration", "clean comic and manhua illustration"],
      },
      {
        file: "packages/shared/src/comic-format.ts",
        forbidden: ["referencePromptHint", "vertical-scroll comic reading format", "orientation unspecified"],
      },
    ];

    checks.forEach(({ file, forbidden }) => {
      const content = source(file);
      forbidden.forEach((phrase) => expect(content, `${file} 不应包含 ${phrase}`).not.toContain(phrase));
    });
  });

  it("两条生产旁路明确调用 Skill 编译入口", () => {
    expect(source("apps/server/src/projects/persistent-task-worker.service.ts"))
      .toContain("buildStoryboardPromptFromFacts");
    expect(source("apps/server/src/projects/persistent-task-worker.service.ts"))
      .toContain("buildStoryStructurePromptFromFacts");
    expect(source("apps/server/src/projects/image-provider.service.ts"))
      .toContain("compileImageReferenceGuidanceForProvider");
  });

  it("A2/A3/A4/A5.3 与 B2/B4 真实生产路径明确读取五个剧本 Skill", () => {
    const promptBuilder = source("apps/server/src/dialogue/dialogue-prompt.util.ts");
    const scriptService = source("apps/server/src/dialogue/script-dialogue.service.ts");
    const importAnalysisService = source("apps/server/src/dialogue/script-import-analysis.service.ts");
    const importBatchService = source("apps/server/src/dialogue/script-import-batch.service.ts");

    expect(promptBuilder).toContain('const skillName = "script-inspiration-seeding"');
    expect(promptBuilder).toContain('const skillName = "script-outline-drafting"');
    expect(promptBuilder).toContain('const skillName = "script-chapter-drafting"');
    expect(promptBuilder).toContain('const skillName = "script-chapter-editing"');
    expect(promptBuilder).toContain('const skillName = "script-import-normalize"');
    expect(scriptService).toContain("buildInspirationSeedsRepairPrompt");
    expect(scriptService).toContain("buildScriptOutlineRepairPrompt");
    expect(scriptService).toContain("buildChapterDraftRepairPrompt");
    expect(scriptService).toContain("buildChapterEditingRepairPrompt");
    expect(importAnalysisService).toContain("buildScriptImportAnalysisPrompt");
    expect(importAnalysisService).toContain("buildScriptImportFormatRepairPrompt");
    expect(importBatchService).toContain("buildScriptImportMaterializePrompt");
    expect(importBatchService).toContain("buildScriptImportVerifyPrompt");
    expect(importBatchService).toContain("buildScriptImportFormatRepairPrompt");
  });

  it("项目管理名称不会进入生产 Prompt 或 AI 状态工具输出", () => {
    const creativePromptAssets = [
      "apps/server/opencodeAI/skills/script-inspiration-seeding/references/inspiration-prompt.md",
      "apps/server/opencodeAI/skills/script-outline-drafting/references/outline-prompt.md",
      "apps/server/opencodeAI/skills/script-chapter-drafting/references/chapter-draft-prompt.md",
      "apps/server/opencodeAI/skills/script-chapter-editing/references/chapter-edit-prompt.md",
      "apps/server/opencodeAI/skills/structure-story-parse/references/story-structure-prompt.md",
      "apps/server/opencodeAI/skills/storyboard-shot-generate/references/storyboard-prompt.md",
    ];

    creativePromptAssets.forEach((file) => {
      expect(source(file), `${file} 不应读取项目管理名称`).not.toContain("{{PROJECT_NAME}}");
    });
    expect(source("apps/server/src/dialogue/dialogue-prompt.util.ts")).not.toContain("PROJECT_NAME:");
    expect(source("apps/server/opencodeAI/plugin/airoaming-tools.js")).not.toContain("s.projectName");
  });
});
