import { describe, expect, it } from "vitest";
import {
  extractCollectiveCountHint,
  findCandidateVisualIssues,
  hasBlockingCandidateVisualIssues,
} from "./candidate-visual-quality.util.js";

const people = [
  { name: "阿肃", entityType: "human" as const },
  { name: "铁锚", entityType: "human" as const },
  { name: "小棠", entityType: "human" as const },
];

describe("candidate visual quality", () => {
  it("接受一个地点、一个瞬间且主客体清楚的多人镜头", () => {
    const issues = findCandidateVisualIssues({
      visualDescription: "阿肃半蹲着挡在小棠前方，铁锚停在他们对面，三人的视线在黑棺上交汇。",
      action: "阿肃伸臂护住小棠，铁锚收住前进的脚步。",
      composition: "阿肃和小棠在左侧中景，铁锚在右侧，黑棺是中心重心。",
      characters: people,
    });
    expect(issues).toEqual([]);
  });

  it("阻断文字禁令、跨地点和多时刻冲突，并标记不可见信息", () => {
    const issues = findCandidateVisualIssues({
      visualDescription: "商队圈内 → 避难舱里，先听见湿咳声，数十秒后棺盖显示‘杀令’文字。",
      action: "阿肃随后转到观察窗前。",
      composition: "文字居中。",
      characters: [{ name: "阿肃", entityType: "human" }],
    });
    const codes = issues.map((item) => item.code);
    expect(codes).toEqual(expect.arrayContaining([
      "VISUAL_TEXT_CONFLICT",
      "VISUAL_MULTIPLE_LOCATIONS",
      "VISUAL_MULTIPLE_MOMENTS",
      "VISUAL_NON_VISUAL_INFORMATION",
    ]));
    expect(hasBlockingCandidateVisualIssues(issues)).toBe(true);
  });

  it("检查明确人数与分镜绑定不一致", () => {
    const issues = findCandidateVisualIssues({
      visualDescription: "两人站在黑棺两侧。",
      action: "阿肃护住小棠，铁锚与他对峙。",
      composition: "三角构图。",
      characters: people,
    });
    expect(issues).toContainEqual(expect.objectContaining({
      code: "VISUAL_SUBJECT_COUNT_CONFLICT",
      severity: "blocking",
    }));
  });

  it("不把禁止文字的说明当成文字要求，也不把动作里的单个人称当成总人数", () => {
    const issues = findCandidateVisualIssues({
      visualDescription: "阿肃、小棠和铁锚都在黑棺旁，画面不出现任何文字。",
      action: "其中一人护住另一人，铁锚停在他们对面。",
      composition: "三人形成三角构图。",
      characters: people,
    });
    expect(issues.map((item) => item.code)).not.toContain("VISUAL_TEXT_CONFLICT");
    expect(issues.map((item) => item.code)).not.toContain("VISUAL_SUBJECT_COUNT_CONFLICT");
  });

  it("群体必须有数量或范围，不得当成一个人", () => {
    const missing = findCandidateVisualIssues({
      visualDescription: "阿肃站在商队众人前方。",
      action: "阿肃挡住商队众人。",
      composition: "阿肃在前景，商队众人在后景。",
      characters: [
        { name: "阿肃", entityType: "human" },
        { name: "商队众人", entityType: "group" },
      ],
    });
    expect(missing).toContainEqual(expect.objectContaining({ code: "VISUAL_GROUP_COUNT_MISSING" }));

    const specified = findCandidateVisualIssues({
      visualDescription: "阿肃站在十余名商队成员前方。",
      action: "阿肃伸臂阻挡十余名商队成员。",
      composition: "阿肃在前景，十余名商队成员在后景。",
      characters: [
        { name: "阿肃", entityType: "human" },
        { name: "商队众人", entityType: "group" },
      ],
    });
    expect(specified.map((item) => item.code)).not.toContain("VISUAL_GROUP_COUNT_MISSING");
    expect(extractCollectiveCountHint("阿肃挡住十余名商队成员")).toBe("十余名");
  });

  it("多角色没有点明至少两个名字时提示主客体不清", () => {
    const issues = findCandidateVisualIssues({
      visualDescription: "三人在黑棺旁紧张对峙。",
      action: "其中一人护住另一人。",
      composition: "三角构图。",
      characters: people,
    });
    expect(issues).toContainEqual(expect.objectContaining({
      code: "VISUAL_ACTOR_RELATION_UNCLEAR",
      severity: "warning",
    }));
  });
});
