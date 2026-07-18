import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SKILL_NAME_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const REFERENCE_PATH_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._/-]*$/;
const TEMPLATE_PLACEHOLDER_PATTERN = /\{\{([A-Z][A-Z0-9_]*)\}\}/g;
const fileCache = new Map<string, string>();
const validatedSkills = new Set<string>();

export interface OpenCodeSkillAsset {
  name: string;
  description: string;
  markdown: string;
  body: string;
}

export function getOpenCodeSkillsRoot(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../opencodeAI/skills");
}

export function readOpenCodeSkill(skillName: string): OpenCodeSkillAsset {
  assertSkillName(skillName);
  const markdown = readAssetFile(path.join(getOpenCodeSkillsRoot(), skillName, "SKILL.md"));
  const match = markdown.match(/^---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/);
  if (!match) throw new TypeError(`OPENCODE_SKILL_FRONTMATTER_INVALID:${skillName}`);

  const name = readFrontmatterValue(match[1] ?? "", "name");
  const description = readFrontmatterValue(match[1] ?? "", "description");
  if (name !== skillName) throw new TypeError(`OPENCODE_SKILL_NAME_MISMATCH:${skillName}:${name}`);
  if (!description) throw new TypeError(`OPENCODE_SKILL_DESCRIPTION_MISSING:${skillName}`);

  validatedSkills.add(skillName);
  return {
    name,
    description,
    markdown,
    body: (match[2] ?? "").trim(),
  };
}

export function readOpenCodeSkillReference(skillName: string, referencePath: string): string {
  assertSkillName(skillName);
  assertReferencePath(referencePath);
  if (!validatedSkills.has(skillName)) readOpenCodeSkill(skillName);

  const skillRoot = path.resolve(getOpenCodeSkillsRoot(), skillName);
  const resolved = path.resolve(skillRoot, "references", referencePath);
  const referencesRoot = path.resolve(skillRoot, "references");
  if (resolved !== referencesRoot && !resolved.startsWith(`${referencesRoot}${path.sep}`)) {
    throw new TypeError(`OPENCODE_SKILL_REFERENCE_OUTSIDE_ROOT:${skillName}:${referencePath}`);
  }
  return readAssetFile(resolved).trim();
}

export function readOpenCodeSkillJsonReference<T>(skillName: string, referencePath: string): T {
  const source = readOpenCodeSkillReference(skillName, referencePath);
  try {
    return JSON.parse(source) as T;
  } catch (error) {
    const message = error instanceof Error ? error.message : "invalid JSON";
    throw new TypeError(`OPENCODE_SKILL_REFERENCE_JSON_INVALID:${skillName}:${referencePath}:${message}`);
  }
}

export function renderOpenCodePromptTemplate(
  template: string,
  variables: Readonly<Record<string, string | number>>,
): string {
  const required = [...template.matchAll(TEMPLATE_PLACEHOLDER_PATTERN)].map((match) => match[1]!);
  const missing = [...new Set(required.filter((name) => !Object.prototype.hasOwnProperty.call(variables, name)))];
  if (missing.length > 0) {
    throw new TypeError(`OPENCODE_PROMPT_TEMPLATE_VARIABLE_MISSING:${missing.join(",")}`);
  }

  const rendered = template.replace(TEMPLATE_PLACEHOLDER_PATTERN, (_placeholder, name: string) => {
    return String(variables[name]);
  }).trim();
  const unresolved = [...rendered.matchAll(TEMPLATE_PLACEHOLDER_PATTERN)].map((match) => match[1]!);
  if (unresolved.length > 0) {
    throw new TypeError(`OPENCODE_PROMPT_TEMPLATE_UNRESOLVED:${[...new Set(unresolved)].join(",")}`);
  }
  return rendered;
}

function readAssetFile(filePath: string): string {
  const cached = fileCache.get(filePath);
  if (cached !== undefined) return cached;
  let value: string;
  try {
    value = readFileSync(filePath, "utf8").replace(/\r\n/g, "\n");
  } catch (error) {
    const message = error instanceof Error ? error.message : "unreadable";
    throw new TypeError(`OPENCODE_SKILL_ASSET_READ_FAILED:${filePath}:${message}`);
  }
  fileCache.set(filePath, value);
  return value;
}

function readFrontmatterValue(frontmatter: string, key: string): string {
  const line = frontmatter.split("\n").find((item) => item.startsWith(`${key}:`));
  return line?.slice(key.length + 1).trim().replace(/^['"]|['"]$/g, "") ?? "";
}

function assertSkillName(skillName: string): void {
  if (!SKILL_NAME_PATTERN.test(skillName)) {
    throw new TypeError(`OPENCODE_SKILL_NAME_INVALID:${skillName}`);
  }
}

function assertReferencePath(referencePath: string): void {
  if (
    !REFERENCE_PATH_PATTERN.test(referencePath)
    || path.isAbsolute(referencePath)
    || referencePath.split("/").includes("..")
  ) {
    throw new TypeError(`OPENCODE_SKILL_REFERENCE_INVALID:${referencePath}`);
  }
}
