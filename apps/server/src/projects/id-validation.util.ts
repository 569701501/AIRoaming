import { BadRequestException } from "@nestjs/common";

/**
 * 路由参数与请求体手动校验(项目未引入 class-validator)。
 *
 * ID 格式约定：项目内 ID 历史格式不统一(projectId=uuid、characterId=`char_<uuid>`、
 * chapterId 可能为 `{projectId}_chapter_{NNN}`、stageId=uuid)，统一按
 * 「1~128 位字母/数字/下划线/连字符」校验，拒绝空串、超长、路径分隔符、
 * 相对路径片段与空白字符。所有 ID 都会进入 URL 路由与 workspace 物理路径，
 * 该白名单同时保证路由安全与路径安全。
 */
const ROUTE_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;

/** 校验路径参数 ID 格式；非法时抛 400 `INVALID_<PARAM>_FORMAT`（paramName 驼峰转大写蛇形，如 projectId → PROJECT_ID）。 */
export function assertRouteId(paramName: string, value: string): void {
  if (typeof value !== "string" || !ROUTE_ID_PATTERN.test(value)) {
    throw new BadRequestException(`INVALID_${paramName.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toUpperCase()}_FORMAT`);
  }
}

/** 校验请求体必须是普通 JSON 对象(拒绝 null/数组/原始值)；非法时抛 400 `INVALID_JSON_BODY`。 */
export function assertJsonObjectBody(body: unknown): asserts body is Record<string, unknown> {
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    throw new BadRequestException("INVALID_JSON_BODY");
  }
}

/**
 * 校验可选字段类型：字段缺省视为未提供；提供时必须是非空字符串，否则抛 400 `INVALID_<FIELD>_TYPE`。
 * 返回裁剪后的值(trim)，用于写入前归一。
 */
export function assertOptionalStringField(value: unknown, field: string): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "string" || value.trim() === "") {
    throw new BadRequestException(`INVALID_${field.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toUpperCase()}_TYPE`);
  }
  return value.trim();
}

/** 校验必填字段必须是非空字符串，否则抛 400 `CHARACTER_STAGE_VISUAL_DELTA_REQUIRED`。 */
export function assertRequiredNonBlankString(value: unknown): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new BadRequestException("CHARACTER_STAGE_VISUAL_DELTA_REQUIRED");
  }
  return value.trim();
}
