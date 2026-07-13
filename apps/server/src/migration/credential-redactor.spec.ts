import { describe, expect, it } from "vitest";
import { createRequire } from "node:module";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { assertNoSecretSentinel, containsSecretSentinel, redactCredentials } from "./credential-redactor.js";

const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite") as {
  readonly DatabaseSync: new (path: string) => { exec(sql: string): void; prepare(sql: string): { run(...values: unknown[]): void }; close(): void };
};

describe("D2-A1-2 credential redactor and SEC-10", () => {
  it("RED-01 recursively redacts sensitive keys and rejects Buffer/Uint8Array sentinels", () => {
    const redacted = redactCredentials({
      apiKey: "airoaming-test-secret-redactor",
      nested: [{ authorization: "Bearer airoaming-test-secret-redactor" }],
      safe: "ordinary text",
    });
    expect(redacted.value).toMatchObject({ apiKey: "[REDACTED]", safe: "ordinary text" });
    expect(redacted.redactedCount).toBe(2);
    expect(containsSecretSentinel(Buffer.from("airoaming-test-secret-buffer"))).toBe(true);
    expect(containsSecretSentinel(new Uint8Array(Buffer.from("airoaming-test-secret-bytes")))).toBe(true);
    expect(() => assertNoSecretSentinel("airoaming-test-secret-plain")).toThrow("SECRET_SENTINEL_DETECTED");
  });

  it("SEC-10 scans DB/settings/report/log/task/artifact/export fixtures and keeps clean fixtures at zero", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "airoaming-sec10-"));
    const sentinel = "airoaming-test-secret-sec10";
    const categories = ["settings", "migration-report", "log", "task", "artifact", "export"];
    try {
      for (const category of categories) {
        const fixture = path.join(root, `${category}.json`);
        await writeFile(fixture, JSON.stringify({ category, payload: sentinel }), { mode: 0o600 });
        expect(containsSecretSentinel(await readFile(fixture))).toBe(true);
      }
      const databasePath = path.join(root, "database.sqlite");
      const database = new DatabaseSync(databasePath);
      database.exec("CREATE TABLE evidence (payload TEXT NOT NULL)");
      database.prepare("INSERT INTO evidence (payload) VALUES (?)").run(sentinel);
      database.close();
      expect(containsSecretSentinel(await readFile(databasePath))).toBe(true);

      const cleanRoot = path.join(root, "clean");
      await mkdir(cleanRoot);
      await writeFile(path.join(cleanRoot, "settings.json"), JSON.stringify({ configured: true, fingerprint: "sha256:abc" }), { mode: 0o600 });
      expect(containsSecretSentinel(await readFile(path.join(cleanRoot, "settings.json")))).toBe(false);
      expect(containsSecretSentinel({ configured: true, fingerprint: "sha256:abc" })).toBe(false);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("M6A1-SEC-01 scans snapshot/DB/settings/report/evidence/backup/restore/archive/log roots", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "airoaming-m6-sec-"));
    const sentinel = "airoaming-test-secret-m6-chain";
    const categories = ["snapshot", "database", "settings", "report", "evidence", "backup", "restore", "archive", "log"];
    try {
      for (const category of categories) {
        const categoryRoot = path.join(root, category);
        await mkdir(categoryRoot, { recursive: true });
        await writeFile(path.join(categoryRoot, "fixture.json"), JSON.stringify({ category, payload: sentinel }), { mode: 0o600 });
        expect(containsSecretSentinel(await readFile(path.join(categoryRoot, "fixture.json")))).toBe(true);
      }
      const cleanRoot = path.join(root, "clean");
      await mkdir(cleanRoot, { recursive: true });
      for (const category of categories) {
        const categoryRoot = path.join(cleanRoot, category);
        await mkdir(categoryRoot, { recursive: true });
        await writeFile(path.join(categoryRoot, "fixture.json"), JSON.stringify({ category, fingerprint: "sha256:" + "a".repeat(64) }), { mode: 0o600 });
        expect(containsSecretSentinel(await readFile(path.join(categoryRoot, "fixture.json")))).toBe(false);
      }
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
