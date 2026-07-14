import assert from "node:assert/strict";
import { readdir } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  E2E_TEST_MATRIX,
  createE2EModeEnvironment,
  selectE2ETestMatrix,
} from "./e2e-test-matrix.mjs";

const e2eRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("assigns every Playwright spec to exactly one persistence mode", async () => {
  const actual = (await listSpecFiles(e2eRoot)).sort();
  const assigned = E2E_TEST_MATRIX.flatMap((entry) => entry.testFiles).sort();
  assert.deepEqual(assigned, actual);
  assert.equal(new Set(assigned).size, assigned.length);
});

test("binds DB-only specs to a DB child environment and file specs to file mode", () => {
  const db = selectE2ETestMatrix("db")[0]!;
  const file = selectE2ETestMatrix("file")[0]!;
  assert.deepEqual(db.testFiles, [
    "tests/e2e/api/g2-db-web-gate.spec.ts",
    "tests/e2e/web/candidate-decision-workbench.spec.ts",
  ]);
  assert.equal(createE2EModeEnvironment(db, {}).AIROAMING_E2E_PERSISTENCE_MODE, "db");
  assert.equal(createE2EModeEnvironment(file, {}).AIROAMING_E2E_PERSISTENCE_MODE, "file");
  assert.throws(() => selectE2ETestMatrix("unknown"), /E2E_MATRIX_MODE_INVALID/);
});

async function listSpecFiles(root: string): Promise<string[]> {
  const result: string[] = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const absolute = path.join(root, entry.name);
    if (entry.isDirectory()) result.push(...await listSpecFiles(absolute));
    else if (entry.isFile() && entry.name.endsWith(".spec.ts")) {
      result.push(path.posix.join("tests/e2e", path.relative(e2eRoot, absolute)));
    }
  }
  return result.map((file) => file.replaceAll(path.sep, "/"));
}
