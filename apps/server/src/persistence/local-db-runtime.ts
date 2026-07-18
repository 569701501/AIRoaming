import { lstat } from "node:fs/promises";
import * as path from "node:path";

export interface LocalDbRuntimeProfile {
  persistenceMode: "db";
  dataRoot: string;
  workspaceRoot: string;
  databasePath: string;
  databaseUrl: string;
}

export interface LocalDbRuntimeState {
  activationState: string;
  activatedAt: Date | null;
}

export class LocalDbRuntimeError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

function absoluteRoot(value: string | undefined, fallback: string, errorCode: string): string {
  const selected = value?.trim() || fallback;
  if (!path.isAbsolute(selected) || selected.includes("\0")) {
    throw new LocalDbRuntimeError(errorCode);
  }
  return path.resolve(selected);
}

function overlaps(left: string, right: string): boolean {
  return left === right
    || left.startsWith(`${right}${path.sep}`)
    || right.startsWith(`${left}${path.sep}`);
}

export function resolveLocalDbRuntimeProfile(
  env: Readonly<Record<string, string | undefined>>,
  homeDir: string,
): LocalDbRuntimeProfile {
  const mode = env.AIROAMING_PERSISTENCE_MODE?.trim();
  if (mode && mode !== "db") {
    throw new LocalDbRuntimeError("LOCAL_DB_RUNTIME_MODE_REQUIRED");
  }

  const home = absoluteRoot(homeDir, homeDir, "LOCAL_DB_RUNTIME_HOME_INVALID");
  const dataRoot = absoluteRoot(
    env.AIROAMING_DATA_ROOT,
    path.join(home, ".airoaming", "data"),
    "LOCAL_DB_RUNTIME_DATA_ROOT_INVALID",
  );
  const workspaceRoot = absoluteRoot(
    env.AIROAMING_WORKSPACE_ROOT,
    path.join(home, ".airoaming", "workspace"),
    "LOCAL_DB_RUNTIME_WORKSPACE_ROOT_INVALID",
  );
  if (overlaps(dataRoot, workspaceRoot)) {
    throw new LocalDbRuntimeError("LOCAL_DB_RUNTIME_ROOT_OVERLAP");
  }

  const databaseUrl = env.DATABASE_URL?.trim()
    || `file:${path.join(dataRoot, "db", "airoaming.sqlite")}`;
  if (!databaseUrl.startsWith("file:") || !path.isAbsolute(databaseUrl.slice("file:".length))) {
    throw new LocalDbRuntimeError("LOCAL_DB_RUNTIME_DATABASE_URL_INVALID");
  }
  const databasePath = path.resolve(databaseUrl.slice("file:".length));
  if (databasePath === dataRoot || !databasePath.startsWith(`${dataRoot}${path.sep}`)) {
    throw new LocalDbRuntimeError("LOCAL_DB_RUNTIME_DATABASE_OUTSIDE_DATA_ROOT");
  }

  return {
    persistenceMode: "db",
    dataRoot,
    workspaceRoot,
    databasePath,
    databaseUrl,
  };
}

export async function assertLocalDbRuntimeDatabaseFile(databasePath: string): Promise<void> {
  const stat = await lstat(databasePath).catch(() => null);
  if (!stat) {
    throw new LocalDbRuntimeError("LOCAL_DB_RUNTIME_DATABASE_MISSING");
  }
  if (stat.isSymbolicLink() || !stat.isFile()) {
    throw new LocalDbRuntimeError("LOCAL_DB_RUNTIME_DATABASE_INVALID");
  }
}

export function assertLocalDbRuntimeState(state: LocalDbRuntimeState | null): void {
  if (!state) {
    throw new LocalDbRuntimeError("LOCAL_DB_RUNTIME_STATE_MISSING");
  }
  if (state.activationState !== "db_only" || state.activatedAt === null) {
    throw new LocalDbRuntimeError("LOCAL_DB_RUNTIME_NOT_ACTIVATED");
  }
}
