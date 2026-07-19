import { BadRequestException } from "@nestjs/common";
import type {
  ProjectCharacterEntityType,
  ProjectCharacterLevel,
  ProjectCharacterReferenceKind,
  ProjectCharacterStatus,
} from "@airoaming/shared";
import { characterVisualIdentityKey, requiredCharacterReferenceKind } from "@airoaming/shared";

/**
 * 角色 normalize 与常量(从 projects.service 抽出,供 ProjectRepository / Service 共用)。
 * 见任务 2026-06-21_ProjectsService拆分 阶段①子步 1b-pre-3。
 *
 * 注:normalizeCharacterName 保持 throw BadRequestException(原行为,400),domain util import @nestjs/common。
 */

const characterLevels: ProjectCharacterLevel[] = ["lead", "recurring", "chapter", "minor", "extra"];
const characterEntityTypes: ProjectCharacterEntityType[] = ["human", "creature", "group", "voice"];
const characterStatuses: ProjectCharacterStatus[] = ["draft", "needs_reference", "finalized", "in_use"];
const characterReferenceKinds: ProjectCharacterReferenceKind[] = ["preview_front", "final_reference", "none"];

export function normalizeCharacterLevel(value: string): ProjectCharacterLevel {
  return characterLevels.includes(value as ProjectCharacterLevel) ? value as ProjectCharacterLevel : "chapter";
}

export function normalizeCharacterStatus(value: string): ProjectCharacterStatus {
  return characterStatuses.includes(value as ProjectCharacterStatus) ? value as ProjectCharacterStatus : "draft";
}

export function normalizeCharacterReferenceKind(value: string): ProjectCharacterReferenceKind {
  if (value === "turnaround_4view") {
    return "final_reference";
  }
  if (value === "single_front") {
    return "preview_front";
  }
  return characterReferenceKinds.includes(value as ProjectCharacterReferenceKind) ? value as ProjectCharacterReferenceKind : "none";
}

export function normalizeEntityType(value: unknown): ProjectCharacterEntityType {
  return typeof value === "string" && characterEntityTypes.includes(value as ProjectCharacterEntityType)
    ? value as ProjectCharacterEntityType
    : "human";
}

export function normalizeCharacterName(value: string): string {
  const name = value.trim().replace(/^[-*•\d.\s]+/u, "");
  if (!name) {
    throw new BadRequestException("CHARACTER_NAME_REQUIRED");
  }
  return name.slice(0, 60);
}

export function defaultReferenceKindForLevel(level: ProjectCharacterLevel): ProjectCharacterReferenceKind {
  if (level === "lead" || level === "recurring") {
    return "final_reference";
  }
  if (level === "chapter" || level === "minor" || level === "extra") {
    return "preview_front";
  }
  return "none";
}

export function normalizeCharacterNameKey(name: string): string {
  return name.trim().toLowerCase();
}

/**
 * 用于结构角色映射的保守身份键。
 *
 * 只有已被结构明确标为 group 的主体才去掉少量群体描述后缀，避免
 * “商队众人 / 商队多人”被建成两份素材；human/creature/voice 继续精确匹配。
 */
export function normalizeCharacterIdentityKey(
  name: string,
  entityType: ProjectCharacterEntityType,
): string {
  return characterVisualIdentityKey(name, entityType);
}

export function getDefaultRoleForLevel(level: ProjectCharacterLevel): string {
  if (level === "lead") {
    return "主角";
  }
  if (level === "recurring") {
    return "重要配角";
  }
  if (level === "minor") {
    return "小角色";
  }
  if (level === "extra") {
    return "背景路人";
  }
  return "本章关键角色";
}

export function isRequiredPreflightReferenceCharacter(
  character: { level: ProjectCharacterLevel; entityType?: ProjectCharacterEntityType },
  _appearanceCount = 0,
  _hasDialogue = false,
): boolean {
  return requiredCharacterReferenceKind({
    level: character.level,
    entityType: character.entityType ?? "human",
  }) !== "none";
}

export function isPrimaryReferenceCompatible(
  primaryReferenceAssetId: string | null,
  primaryReferenceKind: ProjectCharacterReferenceKind,
): boolean {
  if (!primaryReferenceAssetId) {
    return false;
  }
  return primaryReferenceKind === "final_reference";
}
