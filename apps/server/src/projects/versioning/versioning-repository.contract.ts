import type {
  VersionCommandContextV1,
  VersionScopeV1,
} from "./versioning-database.types.js";

export interface VersionRepositoryResultV1 {
  readonly id: string;
  readonly chapterId: string;
  readonly version: number;
  readonly status: "pending_confirmation" | "confirmed" | "archived";
  readonly rowVersion: number;
  readonly sourceDigest: string | null;
  readonly documentDigest: string;
}

export interface VersionCommandRequestV1 {
  readonly scope: VersionScopeV1;
  readonly expectedRowVersion: number;
  readonly requestId: string;
}

/**
 * Stable seams for B/C1/D1.  Implementations own a complete transaction and
 * must never expose Prisma model rows to a controller.
 */
export interface ScriptVersionRepositoryContractV1 {
  saveWorkingCopy(request: VersionCommandRequestV1, context: VersionCommandContextV1): Promise<VersionRepositoryResultV1>;
  publish(request: VersionCommandRequestV1, context: VersionCommandContextV1): Promise<VersionRepositoryResultV1>;
}

export interface StoryVersionRepositoryContractV1 {
  createPending(request: VersionCommandRequestV1, context: VersionCommandContextV1): Promise<VersionRepositoryResultV1>;
  confirm(request: VersionCommandRequestV1, context: VersionCommandContextV1): Promise<VersionRepositoryResultV1>;
}

export interface StoryboardVersionRepositoryContractV1 {
  createPending(request: VersionCommandRequestV1, context: VersionCommandContextV1): Promise<VersionRepositoryResultV1>;
  confirm(request: VersionCommandRequestV1, context: VersionCommandContextV1): Promise<VersionRepositoryResultV1>;
}

export interface PreflightRevisionRepositoryContractV1 {
  preview(request: VersionCommandRequestV1, context: VersionCommandContextV1): Promise<VersionRepositoryResultV1>;
  confirm(request: VersionCommandRequestV1, context: VersionCommandContextV1): Promise<VersionRepositoryResultV1>;
}
