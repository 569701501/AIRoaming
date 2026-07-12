import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../..",
);
const TASK_PLAN_PATH = path.join(
  REPO_ROOT,
  "文档/05_执行与记录/任务记录/2026-07-11_G1至G5连续实施/task_plan.md",
);
const QA_PATH = path.join(
  REPO_ROOT,
  "文档/06_测试与验收/G1数据库迁移执行与验收清单.md",
);

const GATE_ID_PATTERN = /^[A-Z]{2,4}-\d{2}(?:[A-Z][A-Z0-9]*)?$/;
const GATE_LIKE_CELL_PATTERN = /^[A-Z]+(?:-|_)?\d/;
const QA_GATE_REFERENCE_PATTERN =
  /^([A-Z]{2,4}-\d{2}(?:[A-Z][A-Z0-9]*)?)（引用 .+）$/;
const PLAN_GATE_RANGE_PATTERN = /^([A-Z]{2,4})-(\d{2})～(\d{2})$/;

interface PlanGateOwnership {
  readonly gateId: string;
  readonly slice: string;
}

function extractQaGateIds(markdown: string): string[] {
  const ids: string[] = [];
  let inGateDefinitionTable = false;
  for (const [lineIndex, line] of markdown.split("\n").entries()) {
    const rawCell = line.match(/^\|\s*(.*?)\s*\|/)?.[1];
    if (rawCell === undefined) {
      inGateDefinitionTable = false;
      continue;
    }
    const cell = rawCell.replace(/^`|`$/g, "");
    if (cell === "ID" || cell === "Gate") {
      inGateDefinitionTable = true;
      continue;
    }
    if (!inGateDefinitionTable || /^-+$/.test(cell)) {
      continue;
    }
    if (GATE_ID_PATTERN.test(cell)) {
      ids.push(cell);
      continue;
    }
    if (QA_GATE_REFERENCE_PATTERN.test(cell)) {
      continue;
    }
    if (GATE_LIKE_CELL_PATTERN.test(cell)) {
      throw new Error(
        `Unsupported or malformed QA gate cell at line ${lineIndex + 1}: ${cell}`,
      );
    }
  }
  if (ids.length !== new Set(ids).size) {
    throw new Error("Duplicate current QA gate definition");
  }
  return [...new Set(ids)].sort();
}

function extractPlanOwnership(markdown: string): PlanGateOwnership[] {
  const ownership: PlanGateOwnership[] = [];
  for (const [lineIndex, line] of markdown.split("\n").entries()) {
    const slice = line.match(/^\|\s*(G1-\d+)\b/)?.[1];
    if (slice === undefined) {
      continue;
    }
    for (const match of line.matchAll(/`([^`]+)`/g)) {
      const token = match[1] as string;
      if (GATE_ID_PATTERN.test(token)) {
        ownership.push({ gateId: token, slice });
        continue;
      }
      const range = token.match(PLAN_GATE_RANGE_PATTERN);
      if (range !== null) {
        const prefix = range[1] as string;
        const start = Number.parseInt(range[2] as string, 10);
        const end = Number.parseInt(range[3] as string, 10);
        if (end < start) {
          throw new Error(
            `Descending plan gate range at line ${lineIndex + 1}: ${token}`,
          );
        }
        for (let value = start; value <= end; value += 1) {
          ownership.push({
            gateId: `${prefix}-${String(value).padStart(2, "0")}`,
            slice,
          });
        }
        continue;
      }
      if (GATE_LIKE_CELL_PATTERN.test(token)) {
        throw new Error(
          `Unsupported or malformed plan gate token at line ${lineIndex + 1}: ${token}`,
        );
      }
    }
  }
  return ownership;
}

describe("G1 task-plan gate ownership", () => {
  it("assigns every current QA gate to exactly one executable G1 slice", async () => {
    const [taskPlan, qa] = await Promise.all([
      readFile(TASK_PLAN_PATH, "utf8"),
      readFile(QA_PATH, "utf8"),
    ]);
    const qaGateIds = extractQaGateIds(qa);
    expect(qaGateIds).toContain("IMP-05A");
    const ownership = extractPlanOwnership(taskPlan);
    const ownersByGate = new Map<string, string[]>();
    for (const { gateId, slice } of ownership) {
      const owners = ownersByGate.get(gateId) ?? [];
      owners.push(slice);
      ownersByGate.set(gateId, owners);
    }

    expect(
      qaGateIds.filter((gateId) => ownersByGate.get(gateId)?.length !== 1),
    ).toEqual([]);
  });

  it("does not assign a ghost gate absent from the current QA matrix", async () => {
    const [taskPlan, qa] = await Promise.all([
      readFile(TASK_PLAN_PATH, "utf8"),
      readFile(QA_PATH, "utf8"),
    ]);
    const qaGateIds = new Set(extractQaGateIds(qa));
    const ownership = extractPlanOwnership(taskPlan);

    expect(
      [...new Set(ownership.map(({ gateId }) => gateId))]
        .filter((gateId) => !qaGateIds.has(gateId))
      .sort(),
    ).toEqual([]);
  });

  it("fails closed instead of accepting a gate prefix or silently dropping malformed gate-like syntax", () => {
    const qaRow = (gateCell: string): string =>
      `| ID | 场景 | 断言 | 状态 |\n| --- | --- | --- | --- |\n| ${gateCell} | scenario | assertion | status |`;
    expect(() => extractQaGateIds(qaRow("IMP-05A-extra")))
      .toThrow(/Unsupported or malformed QA gate cell/);
    expect(() => extractQaGateIds(qaRow("IMP_05A")))
      .toThrow(/Unsupported or malformed QA gate cell/);
    expect(() => extractQaGateIds(qaRow("A-01")))
      .toThrow(/Unsupported or malformed QA gate cell/);
    expect(() => extractQaGateIds(qaRow("ABCDE-01")))
      .toThrow(/Unsupported or malformed QA gate cell/);
    expect(() => extractPlanOwnership(
      "| G1-9 M2 | importer | `IMP-01～20`、`IMP-05A-extra` | pending |",
    )).toThrow(/Unsupported or malformed plan gate token/);
    expect(() => extractPlanOwnership(
      "| G1-9 M2 | importer | `A-01` | pending |",
    )).toThrow(/Unsupported or malformed plan gate token/);
    expect(() => extractPlanOwnership(
      "| G1-9 M2 | importer | `ABCDE-01` | pending |",
    )).toThrow(/Unsupported or malformed plan gate token/);
    expect(() => extractPlanOwnership(
      "| G1-9 M2 | importer | `IMP-20～01` | pending |",
    )).toThrow(/Descending plan gate range/);
    expect(
      extractQaGateIds(qaRow("DEL-00（引用 3.1 唯一定义）")),
    ).toEqual([]);
  });
});
