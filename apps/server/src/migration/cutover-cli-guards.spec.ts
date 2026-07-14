import { execFile } from "node:child_process";
import * as os from "node:os";
import * as path from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

const absolute = (name: string) => path.join(os.tmpdir(), "airoaming-guard", name);
const execFileAsync = promisify(execFile);
const serverRoot = path.resolve(import.meta.dirname, "../..");
const finalArgs = (secretRoot: string, extra: string[] = []) => [
  "--kind", "final", "--snapshot", absolute("snapshot"), "--decisions", absolute("decisions.json"),
  "--database-url", `file:${absolute("db.sqlite")}`, "--report", absolute("report.json"),
  "--workspace-root", absolute("workspace"), "--data-root", absolute("data"), "--release-root", absolute("release"),
  "--run-id", "run-01", "--format", "json", "--secret-store-root", secretRoot, ...extra,
];

describe("production CLI test-only guards", () => {
  it("RCUT-SEC-08 rejects fake secret roots unless test-only and under tmp", async () => {
    const script = path.join(serverRoot, "src/migration/db-import.cli.ts");
    await expect(execFileAsync("pnpm", ["exec", "tsx", script, ...finalArgs(absolute("fake"))], { cwd: serverRoot, env: { ...process.env, NODE_ENV: "production" } })).rejects.toMatchObject({ stderr: expect.stringContaining("MIGRATION_SECRET_STORE_TEST_ONLY_REQUIRED") });
    await expect(execFileAsync("pnpm", ["exec", "tsx", script, ...finalArgs("/Users/Shared/airoaming-fake", ["--test-only-fake-secret-store", "true"])], { cwd: serverRoot, env: { ...process.env, NODE_ENV: "test" } })).rejects.toMatchObject({ stderr: expect.stringContaining("MIGRATION_SECRET_STORE_TEST_ONLY_REQUIRED") });
  });

  it("ready CLI applies the same fake-root gate before DB initialization", async () => {
    const args = ["--format", "json", "--database-url", `file:${absolute("db.sqlite")}`, "--run-id", "run-01", "--release-root", absolute("release"), "--workspace-root", absolute("workspace"), "--maintenance-bundle", absolute("runtime.json"), "--secret-store-root", absolute("fake")];
    const script = path.join(serverRoot, "src/migration/db-ready.cli.ts");
    await expect(execFileAsync("pnpm", ["exec", "tsx", script, ...args], { cwd: serverRoot, env: { ...process.env, NODE_ENV: "production" } })).rejects.toMatchObject({ stderr: expect.stringContaining("MIGRATION_SECRET_STORE_TEST_ONLY_REQUIRED") });
  });

  it("RCUT-ACT-01/02 rejects activate arguments before Prisma initialization", async () => {
    const script = path.join(serverRoot, "src/migration/db-activate.cli.ts");
    await expect(execFileAsync("pnpm", ["exec", "tsx", script], { cwd: serverRoot, env: { ...process.env, NODE_ENV: "production" } })).rejects.toMatchObject({ stderr: expect.stringContaining("ACTIVATE_ARGS_INVALID") });
    await expect(execFileAsync("pnpm", ["exec", "tsx", script, "--dry-run", "--format", "json", "--database-url", `file:${absolute("db.sqlite")}`], { cwd: serverRoot, env: { ...process.env, NODE_ENV: "production" } })).rejects.toMatchObject({ stderr: expect.stringContaining("ACTIVATE_ARGS_INVALID") });
  });

  it("RCUT-CLI-01 rejects an unknown cutover step before reading the plan", async () => {
    const script = path.join(serverRoot, "src/migration/db-cutover.cli.ts");
    await expect(execFileAsync("pnpm", ["exec", "tsx", script, "step", "--plan", absolute("missing-plan.json"), "--evidence-root", absolute("evidence"), "--step", "C8", "--format", "json"], { cwd: serverRoot, env: { ...process.env, NODE_ENV: "production" } })).rejects.toMatchObject({ stderr: expect.stringContaining("CUTOVER_STEP_INVALID") });
  });
});
