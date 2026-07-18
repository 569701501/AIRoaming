import * as path from "node:path";
import { describe, expect, it } from "vitest";

import {
  LocalDbRuntimeError,
  assertLocalDbRuntimeState,
  resolveLocalDbRuntimeProfile,
} from "./local-db-runtime.js";

describe("local DB-only runtime profile", () => {
  it("uses one stable DB-only runtime root when pnpm dev has no overrides", () => {
    const homeDir = path.join(path.sep, "Users", "tester");

    expect(resolveLocalDbRuntimeProfile({}, homeDir)).toEqual({
      persistenceMode: "db",
      dataRoot: path.join(homeDir, ".airoaming", "data"),
      workspaceRoot: path.join(homeDir, ".airoaming", "workspace"),
      databasePath: path.join(homeDir, ".airoaming", "data", "db", "airoaming.sqlite"),
      databaseUrl: `file:${path.join(homeDir, ".airoaming", "data", "db", "airoaming.sqlite")}`,
    });
  });

  it("refuses an accidental file-mode override on the standard launcher", () => {
    expect(() => resolveLocalDbRuntimeProfile({ AIROAMING_PERSISTENCE_MODE: "file" }, "/Users/tester"))
      .toThrowError(new LocalDbRuntimeError("LOCAL_DB_RUNTIME_MODE_REQUIRED"));
  });

  it("requires the SQLite file to live inside the configured data root", () => {
    expect(() => resolveLocalDbRuntimeProfile({
      AIROAMING_DATA_ROOT: "/Users/tester/.airoaming/data",
      DATABASE_URL: "file:/tmp/unrelated.sqlite",
    }, "/Users/tester"))
      .toThrowError(new LocalDbRuntimeError("LOCAL_DB_RUNTIME_DATABASE_OUTSIDE_DATA_ROOT"));
  });

  it("accepts only an activated DB-only persistence state", () => {
    expect(() => assertLocalDbRuntimeState(null))
      .toThrowError(new LocalDbRuntimeError("LOCAL_DB_RUNTIME_STATE_MISSING"));
    expect(() => assertLocalDbRuntimeState({ activationState: "ready_for_activation", activatedAt: null }))
      .toThrowError(new LocalDbRuntimeError("LOCAL_DB_RUNTIME_NOT_ACTIVATED"));
    expect(() => assertLocalDbRuntimeState({ activationState: "db_only", activatedAt: null }))
      .toThrowError(new LocalDbRuntimeError("LOCAL_DB_RUNTIME_NOT_ACTIVATED"));
    expect(() => assertLocalDbRuntimeState({ activationState: "db_only", activatedAt: new Date("2026-07-14T12:00:00.000Z") }))
      .not.toThrow();
  });
});
