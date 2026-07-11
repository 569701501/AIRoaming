import { NestFactory } from "@nestjs/core";
import {
  access,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rename,
  rm,
  stat,
  symlink,
  writeFile,
} from "node:fs/promises";
import { homedir, tmpdir, userInfo } from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SevenStageFixture } from "./seven-stage-fixture.js";

const ENV_NAMES = [
  "AIROAMING_WORKSPACE_ROOT",
  "AIROAMING_DATA_ROOT",
  "AIROAMING_SECRET_STORE_ADAPTER",
  "AIROAMING_FAKE_SECRET_STORE_ROOT",
  "OPENCODE_AUTO_START",
  "OPENAI_IMAGE_API_KEY",
  "GROK_IMAGE_API_KEY",
  "OPENAI_API_KEY",
  "ARK_API_KEY",
  "DOUBAO_API_KEY",
  "XAI_API_KEY",
  "DATABASE_URL",
  "AIROAMING_PERSISTENCE_MODE",
  "AIROAMING_MAINTENANCE_MODE",
  "HOME",
  "XDG_CONFIG_HOME",
  "XDG_CACHE_HOME",
] as const;

const originalEnvironment = captureEnvironment();

describe("G1 SevenStageFixture isolation", () => {
  afterEach(() => restoreEnvironment(originalEnvironment));

  it("ENV-01～04: owns three canonical roots, isolates DB/secret env and restores all captured names", async () => {
    setInheritedPoison();
    const inherited = captureEnvironment();
    const tempRoot = await mkdtemp(path.join(tmpdir(), "seven-stage-fixture-test-"));
    const fixture = new SevenStageFixture(tempRoot);

    try {
      await fixture.start();
      expect(path.dirname(fixture.testRoot)).toBe(await realpath(tempRoot));
      expect(process.env.AIROAMING_WORKSPACE_ROOT).toBe(fixture.workspaceRoot);
      expect(process.env.AIROAMING_DATA_ROOT).toBe(fixture.dataRoot);
      expect(process.env.AIROAMING_SECRET_STORE_ADAPTER).toBe("fake");
      expect(process.env.AIROAMING_FAKE_SECRET_STORE_ROOT).toBe(fixture.fakeSecretStoreRoot);
      expect(process.env.DATABASE_URL).toBe(`file:${path.join(fixture.dataRoot, "db", "airoaming.sqlite")}`);
      expect(process.env.AIROAMING_PERSISTENCE_MODE).toBe("file");
      expect(process.env.AIROAMING_MAINTENANCE_MODE).toBeUndefined();
      expect(process.env.OPENCODE_AUTO_START).toBe("false");
      expect(process.env.HOME).toBe(path.join(fixture.testRoot, "home"));
      expect(process.env.XDG_CONFIG_HOME).toBe(path.join(fixture.testRoot, "xdg-config"));
      expect(process.env.XDG_CACHE_HOME).toBe(path.join(fixture.testRoot, "xdg-cache"));
      for (const name of [
        "OPENAI_IMAGE_API_KEY",
        "GROK_IMAGE_API_KEY",
        "OPENAI_API_KEY",
        "ARK_API_KEY",
        "DOUBAO_API_KEY",
        "XAI_API_KEY",
      ]) {
        expect(process.env[name]).toBeUndefined();
      }
      expect(new Set([
        fixture.workspaceRoot,
        fixture.dataRoot,
        fixture.fakeSecretStoreRoot,
      ]).size).toBe(3);
      await Promise.all([
        access(fixture.workspaceRoot),
        access(path.join(fixture.dataRoot, "db")),
        access(fixture.fakeSecretStoreRoot),
        access(path.join(fixture.testRoot, "home")),
        access(path.join(fixture.testRoot, "xdg-config")),
        access(path.join(fixture.testRoot, "xdg-cache")),
      ]);
      await expect(readFile(
        path.join(fixture.fakeSecretStoreRoot, "image-provider.secret"),
        "utf8",
      )).resolves.toBe(`airoaming-test-secret-${fixture.runId}`);
    } finally {
      await fixture.dispose();
      await rm(tempRoot, { recursive: true, force: true });
    }

    await expect(access(fixture.testRoot)).rejects.toMatchObject({ code: "ENOENT" });
    expectEnvironment(inherited);
  });

  it("canonicalizes a benign temp alias and rejects aliases into protected data/home roots", async () => {
    const sandbox = await mkdtemp(path.join(tmpdir(), "seven-stage-canonical-test-"));
    const safeTemp = path.join(sandbox, "safe-temp");
    const protectedData = path.join(sandbox, "protected-data");
    await mkdir(safeTemp);
    await mkdir(protectedData);
    const evidencePath = path.join(protectedData, "must-survive.sqlite");
    await writeFile(evidencePath, "protected", "utf8");
    const evidenceBefore = await fileEvidence(evidencePath);

    const safeAlias = path.join(sandbox, "safe-alias");
    await symlink(safeTemp, safeAlias);
    const safeFixture = new SevenStageFixture(safeAlias);
    expect(path.dirname(safeFixture.testRoot)).toBe(await realpath(safeTemp));

    process.env.AIROAMING_DATA_ROOT = protectedData;
    const protectedAlias = path.join(sandbox, "protected-alias");
    await symlink(protectedData, protectedAlias);
    expect(() => new SevenStageFixture(protectedAlias)).toThrow(/SEVEN_STAGE_FIXTURE_TEMP_ROOT_DANGEROUS/);
    const workspaceAlias = path.join(sandbox, "workspace-alias");
    await symlink(path.resolve(process.cwd(), "../../workspace"), workspaceAlias);
    expect(() => new SevenStageFixture(workspaceAlias)).toThrow(/SEVEN_STAGE_FIXTURE_TEMP_ROOT_DANGEROUS/);
    const homeAlias = path.join(sandbox, "home-alias");
    await symlink(homedir(), homeAlias);
    expect(() => new SevenStageFixture(homeAlias)).toThrow(/SEVEN_STAGE_FIXTURE_TEMP_ROOT_DANGEROUS/);
    expect(await fileEvidence(evidencePath)).toEqual(evidenceBefore);
    await rm(sandbox, { recursive: true, force: true });
  });

  it("Fixture A temporary HOME cannot make Fixture B accept the real account home", async () => {
    const tempRoot = await mkdtemp(path.join(tmpdir(), "seven-stage-stable-account-home-"));
    const fixtureA = new SevenStageFixture(tempRoot);
    try {
      await fixtureA.start();
      expect(process.env.HOME).toBe(path.join(fixtureA.testRoot, "home"));
      expect(() => new SevenStageFixture(userInfo().homedir))
        .toThrow(/SEVEN_STAGE_FIXTURE_TEMP_ROOT_DANGEROUS/);
    } finally {
      await fixtureA.dispose();
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it("reopen prepare failure restores every environment name captured before start", async () => {
    setInheritedPoison();
    const inherited = captureEnvironment();
    const tempRoot = await mkdtemp(path.join(tmpdir(), "seven-stage-reopen-test-"));
    const fixture = new SevenStageFixture(tempRoot);
    await fixture.start();
    const legalMarker = JSON.parse(await readFile(fixture.markerPath, "utf8")) as Record<string, unknown>;
    await writeFile(fixture.markerPath, `${JSON.stringify({ ...legalMarker, runId: "tampered" })}\n`, "utf8");

    await expect(fixture.reopen()).rejects.toThrow(/SEVEN_STAGE_FIXTURE_MARKER_MISMATCH/);
    expectEnvironment(inherited);

    await writeFile(fixture.markerPath, `${JSON.stringify(legalMarker, null, 2)}\n`, "utf8");
    await fixture.dispose();
    await rm(tempRoot, { recursive: true, force: true });
  });

  it("first start failure after env application restores every captured name and removes owned roots", async () => {
    setInheritedPoison();
    const inherited = captureEnvironment();
    const tempRoot = await mkdtemp(path.join(tmpdir(), "seven-stage-first-start-failure-"));
    const fixture = new SevenStageFixture(tempRoot);
    const createContext = vi.spyOn(NestFactory, "createApplicationContext")
      .mockRejectedValueOnce(new Error("DETERMINISTIC_CONTEXT_START_FAILURE"));

    try {
      await expect(fixture.start()).rejects.toThrow(/DETERMINISTIC_CONTEXT_START_FAILURE/);
      expectEnvironment(inherited);
      await expect(access(fixture.testRoot)).rejects.toMatchObject({ code: "ENOENT" });
      await expect(access(fixture.workspaceRoot)).rejects.toMatchObject({ code: "ENOENT" });
      await expect(access(fixture.dataRoot)).rejects.toMatchObject({ code: "ENOENT" });
      await expect(access(fixture.fakeSecretStoreRoot)).rejects.toMatchObject({ code: "ENOENT" });
    } finally {
      createContext.mockRestore();
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it("fences every marker identity field independently and preserves all owned roots", async () => {
    for (const [field, tamperedValue] of [
      ["runId", "tampered-run"],
      ["testRoot", "/tampered/test-root"],
      ["workspaceRoot", "/tampered/workspace"],
      ["dataRoot", "/tampered/data"],
      ["fakeSecretStoreRoot", "/tampered/fake-secret-store"],
    ] as const) {
      const tempRoot = await mkdtemp(path.join(tmpdir(), `seven-stage-marker-${field}-`));
      const fixture = new SevenStageFixture(tempRoot);
      await fixture.start();
      const legalMarker = JSON.parse(await readFile(fixture.markerPath, "utf8")) as Record<string, unknown>;
      const evidencePaths = [
        path.join(fixture.workspaceRoot, "must-survive.txt"),
        path.join(fixture.dataRoot, "must-survive.db"),
        path.join(fixture.fakeSecretStoreRoot, "must-survive.secret"),
      ];
      await Promise.all(evidencePaths.map((target, index) => writeFile(target, `evidence-${index}`, "utf8")));
      const before = await Promise.all(evidencePaths.map(fileEvidence));
      await writeFile(
        fixture.markerPath,
        `${JSON.stringify({ ...legalMarker, [field]: tamperedValue }, null, 2)}\n`,
        "utf8",
      );

      await expect(fixture.dispose()).rejects.toThrow(/SEVEN_STAGE_FIXTURE_MARKER_MISMATCH/);
      expect(await Promise.all(evidencePaths.map(fileEvidence))).toEqual(before);

      await writeFile(fixture.markerPath, `${JSON.stringify(legalMarker, null, 2)}\n`, "utf8");
      await fixture.dispose();
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it("prepare/reopen rejects symlinks at testRoot and every owned child without touching targets", async () => {
    for (const rootKind of ["testRoot", "workspaceRoot", "dataRoot", "fakeSecretStoreRoot"] as const) {
      const tempRoot = await mkdtemp(path.join(tmpdir(), `seven-stage-prepare-${rootKind}-`));
      const fixture = new SevenStageFixture(tempRoot);
      await fixture.start();
      const target = path.join(tempRoot, `protected-target-${rootKind}`);
      const evidencePath = path.join(target, "must-survive.txt");
      await mkdir(target);
      await writeFile(evidencePath, `prepare-${rootKind}`, "utf8");
      const before = await fileEvidence(evidencePath);
      const parked = await replaceWithSymlink(fixture[rootKind], target);

      await expect(fixture.reopen()).rejects.toThrow(/SEVEN_STAGE_FIXTURE_/);
      expect(await fileEvidence(evidencePath)).toEqual(before);

      await restoreParkedRoot(fixture[rootKind], parked);
      await fixture.dispose();
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it("cleanup rejects symlinks at testRoot and every owned child without touching targets", async () => {
    for (const rootKind of ["testRoot", "workspaceRoot", "dataRoot", "fakeSecretStoreRoot"] as const) {
      const tempRoot = await mkdtemp(path.join(tmpdir(), `seven-stage-cleanup-${rootKind}-`));
      const fixture = new SevenStageFixture(tempRoot);
      await fixture.start();
      const target = path.join(tempRoot, `protected-target-${rootKind}`);
      const evidencePath = path.join(target, "must-survive.txt");
      await mkdir(target);
      await writeFile(evidencePath, `cleanup-${rootKind}`, "utf8");
      const before = await fileEvidence(evidencePath);
      const parked = await replaceWithSymlink(fixture[rootKind], target);

      await expect(fixture.dispose()).rejects.toThrow(/SEVEN_STAGE_FIXTURE_/);
      expect(await fileEvidence(evidencePath)).toEqual(before);

      await restoreParkedRoot(fixture[rootKind], parked);
      await fixture.dispose();
      await rm(tempRoot, { recursive: true, force: true });
    }
  });
});

function captureEnvironment(): Map<string, string | undefined> {
  return new Map(ENV_NAMES.map((name) => [name, process.env[name]] as const));
}

function restoreEnvironment(snapshot: ReadonlyMap<string, string | undefined>): void {
  for (const [name, value] of snapshot) {
    if (value === undefined) {
      delete process.env[name];
    } else {
      process.env[name] = value;
    }
  }
}

function setInheritedPoison(): void {
  for (const name of ENV_NAMES) {
    process.env[name] = `inherited-${name.toLowerCase()}`;
  }
}

function expectEnvironment(expected: ReadonlyMap<string, string | undefined>): void {
  for (const [name, value] of expected) {
    expect(process.env[name], name).toBe(value);
  }
}

async function fileEvidence(target: string) {
  const [bytes, metadata] = await Promise.all([readFile(target), stat(target)]);
  return { bytes: bytes.toString("base64"), size: metadata.size, mtimeMs: metadata.mtimeMs };
}

async function replaceWithSymlink(root: string, target: string): Promise<string> {
  const parked = `${root}-parked`;
  await rename(root, parked);
  await symlink(target, root);
  return parked;
}

async function restoreParkedRoot(root: string, parked: string): Promise<void> {
  await rm(root, { force: true });
  await rename(parked, root);
}
