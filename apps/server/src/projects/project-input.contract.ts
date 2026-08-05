import { HttpException, HttpStatus } from "@nestjs/common";
import {
  isComicFormat,
  type ArtStyle,
  type CreateProjectRequest,
  type ProjectType,
  type UpdateProjectDraftRequest,
} from "@airoaming/shared";

type ProjectInputField = keyof CreateProjectRequest;

const CREATE_FIELDS = [
  "name",
  "type",
  "comicFormat",
  "storyTitle",
  "genreTags",
  "artStyle",
  "description",
  "sourceText",
  "documentWorkId",
] as const satisfies readonly ProjectInputField[];

const UPDATE_FIELDS = [
  "name",
  "storyTitle",
  "genreTags",
  "artStyle",
  "description",
  "sourceText",
] as const satisfies readonly (keyof UpdateProjectDraftRequest)[];

export type ProjectInputErrorCode =
  | "PROJECT_BODY_INVALID"
  | "PROJECT_INPUT_FIELD_UNSUPPORTED"
  | "PROJECT_NAME_REQUIRED"
  | "COMIC_FORMAT_REQUIRED"
  | "COMIC_FORMAT_INVALID"
  | "COMIC_FORMAT_IMMUTABLE";

const ERROR_MESSAGES: Record<ProjectInputErrorCode, string> = {
  PROJECT_BODY_INVALID: "请求内容无效",
  PROJECT_INPUT_FIELD_UNSUPPORTED: "请求包含不支持的字段",
  PROJECT_NAME_REQUIRED: "请输入项目名称",
  COMIC_FORMAT_REQUIRED: "请选择漫画版式",
  COMIC_FORMAT_INVALID: "漫画版式无效，请重新选择",
  COMIC_FORMAT_IMMUTABLE: "漫画版式创建后不可直接修改",
};

export class ProjectInputException extends HttpException {
  readonly code: ProjectInputErrorCode;

  constructor(code: ProjectInputErrorCode, status: HttpStatus, details?: unknown) {
    super({
      success: false,
      error: {
        code,
        message: ERROR_MESSAGES[code],
        ...(details === undefined ? {} : { details }),
      },
    }, status);
    this.code = code;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertBody(value: unknown): asserts value is Record<string, unknown> {
  if (!isRecord(value)) {
    throw new ProjectInputException("PROJECT_BODY_INVALID", HttpStatus.BAD_REQUEST);
  }
}

function unsupportedFields(value: Record<string, unknown>, allowed: readonly string[]): string[] {
  const allowlist = new Set(allowed);
  return Object.keys(value)
    .filter((field) => !allowlist.has(field))
    .sort()
    .slice(0, 20);
}

function assertSupportedFields(value: Record<string, unknown>, allowed: readonly string[]): void {
  const fields = unsupportedFields(value, allowed);
  if (fields.length > 0) {
    throw new ProjectInputException("PROJECT_INPUT_FIELD_UNSUPPORTED", HttpStatus.BAD_REQUEST, { fields });
  }
}

function readOptionalString(value: Record<string, unknown>, key: string): string | undefined {
  const item = value[key];
  if (item === undefined) return undefined;
  return typeof item === "string" ? item : undefined;
}

function readOptionalStringArray(value: Record<string, unknown>, key: string): string[] | undefined {
  const item = value[key];
  if (item === undefined) return undefined;
  return Array.isArray(item) && item.every((entry) => typeof entry === "string")
    ? [...item]
    : undefined;
}

export function parseCreateProjectRequestV1(value: unknown): CreateProjectRequest {
  assertBody(value);
  assertSupportedFields(value, CREATE_FIELDS);

  const name = value.name;
  if (typeof name !== "string" || name.trim() === "") {
    throw new ProjectInputException("PROJECT_NAME_REQUIRED", HttpStatus.BAD_REQUEST);
  }

  const comicFormat = value.comicFormat;
  if (typeof comicFormat !== "string" || comicFormat.trim() === "") {
    throw new ProjectInputException("COMIC_FORMAT_REQUIRED", HttpStatus.BAD_REQUEST);
  }
  if (!isComicFormat(comicFormat)) {
    throw new ProjectInputException("COMIC_FORMAT_INVALID", HttpStatus.BAD_REQUEST);
  }

  const result: CreateProjectRequest = {
    name,
    type: (typeof value.type === "string" ? value.type : "comic") as ProjectType,
    comicFormat,
  };
  const storyTitle = readOptionalString(value, "storyTitle");
  const genreTags = readOptionalStringArray(value, "genreTags");
  const artStyle = readOptionalString(value, "artStyle");
  const description = readOptionalString(value, "description");
  const sourceText = readOptionalString(value, "sourceText");
  const documentWorkId = readOptionalString(value, "documentWorkId");
  if (storyTitle !== undefined) result.storyTitle = storyTitle;
  if (genreTags !== undefined) result.genreTags = genreTags;
  if (artStyle !== undefined) result.artStyle = artStyle as ArtStyle;
  if (description !== undefined) result.description = description;
  if (sourceText !== undefined) result.sourceText = sourceText;
  if (documentWorkId !== undefined) result.documentWorkId = documentWorkId;
  return result;
}

export function parseUpdateProjectDraftRequestV1(value: unknown): UpdateProjectDraftRequest {
  assertBody(value);

  if (Object.prototype.hasOwnProperty.call(value, "comicFormat")) {
    throw new ProjectInputException("COMIC_FORMAT_IMMUTABLE", HttpStatus.CONFLICT);
  }
  assertSupportedFields(value, UPDATE_FIELDS);

  const result: UpdateProjectDraftRequest = {};
  const name = readOptionalString(value, "name");
  const storyTitle = readOptionalString(value, "storyTitle");
  const genreTags = readOptionalStringArray(value, "genreTags");
  const artStyle = readOptionalString(value, "artStyle");
  const description = readOptionalString(value, "description");
  const sourceText = readOptionalString(value, "sourceText");
  if (name !== undefined) result.name = name;
  if (storyTitle !== undefined) result.storyTitle = storyTitle;
  if (genreTags !== undefined) result.genreTags = genreTags;
  if (artStyle !== undefined) result.artStyle = artStyle as ArtStyle;
  if (description !== undefined) result.description = description;
  if (sourceText !== undefined) result.sourceText = sourceText;
  return result;
}
