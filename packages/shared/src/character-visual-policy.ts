import type {
  ProjectCharacterEntityType,
  ProjectCharacterLevel,
  ProjectCharacterReferenceKind,
} from "./dto.js";

export interface CharacterVisualPolicyInput {
  level: ProjectCharacterLevel;
  entityType: ProjectCharacterEntityType;
}

/**
 * 角色素材身份的保守匹配键。
 *
 * 仅对明确标记为 group 的主体去掉少量群体描述后缀，用于把
 * “商队众人 / 商队多人”识别为同一份群体素材；其他主体保持精确名称，
 * 避免把真实的不同人物或生物误合并。
 */
export function characterVisualIdentityKey(
  name: string,
  entityType: ProjectCharacterEntityType,
): string {
  const exact = name.trim().toLocaleLowerCase().replace(/\s+/gu, " ");
  if (entityType !== "group") {
    return exact;
  }
  const base = exact.replace(/(?:的)?(?:一行人|成员们|众人|多人|人群|全体|成员)$/u, "").trim();
  return [...base].length >= 2 ? base : exact;
}

/**
 * 剧情结构确认后即可确定的角色视觉素材合同。
 *
 * 该合同故意不读取 storyboard / appearanceCount：下游镜头不能反向改变
 * 上游角色要准备哪一种素材。见 ADR-0018。
 */
export function requiredCharacterReferenceKind(
  character: CharacterVisualPolicyInput,
): ProjectCharacterReferenceKind {
  if (character.entityType === "voice") {
    return "none";
  }
  if (character.entityType === "creature" || character.entityType === "group") {
    return "preview_front";
  }
  return character.level === "lead"
    || character.level === "recurring"
    || character.level === "chapter"
    ? "final_reference"
    : "preview_front";
}

/** final_reference 可向下满足 preview_front；preview 不能反向满足 final。 */
export function referenceKindSatisfiesRequirement(
  requirement: ProjectCharacterReferenceKind,
  available: ProjectCharacterReferenceKind,
): boolean {
  if (requirement === "none") {
    return true;
  }
  if (requirement === "preview_front") {
    return available === "preview_front" || available === "final_reference";
  }
  return available === "final_reference";
}
