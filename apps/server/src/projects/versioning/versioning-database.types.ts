import type { Prisma } from "@prisma/client";

export interface VersionScopeV1 {
  readonly projectId: string;
  readonly chapterId: string;
}

export interface VersionExpectedConcurrencyV1 {
  readonly rowVersion: number;
  readonly commandId?: string;
}

export interface VersionCommandContextV1 {
  readonly scope: VersionScopeV1;
  readonly expected: VersionExpectedConcurrencyV1;
  readonly tx: Prisma.TransactionClient;
}

export type VersionCommandTransactionV1 = <T>(
  operation: (context: VersionCommandContextV1) => Promise<T>,
) => Promise<T>;

export type G2DatabaseClientV1 = Pick<Prisma.TransactionClient, "chapter"> & {
  readonly chapter: Prisma.TransactionClient["chapter"];
};

export const G2_VERSION_TASK_TYPES = [
  "story_parse",
  "shot_generate",
  "shot_prompt_generate",
  "image_generate",
] as const;

export type G2VersionTaskType = (typeof G2_VERSION_TASK_TYPES)[number];
