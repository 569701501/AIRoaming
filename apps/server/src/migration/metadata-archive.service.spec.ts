import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { MetadataArchiveError, MetadataArchiveService } from "./metadata-archive.service.js";

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });

async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), "airoaming-archive-test-"));
  roots.push(root);
  const workspace = path.join(root, "workspace");
  await mkdir(path.join(workspace, "projects", "p1", "assets"), { recursive: true });
  await writeFile(path.join(workspace, "projects", "p1", "project.json"), JSON.stringify({ id: "p1", apiKey: "airoaming-test-secret-archive" }));
  await writeFile(path.join(workspace, "projects", "p1", "assets", "a.bin"), "asset-bytes");
  return { workspace, archive: path.join(root, "archive") };
}

describe("MetadataArchiveService", () => {
  it("archives redacted metadata while retaining only asset paths", async () => {
    const fixtureRoot = await fixture();
    await expect(new MetadataArchiveService().archive({ workspaceRoot: fixtureRoot.workspace, archiveRoot: fixtureRoot.archive, marker: "m6-test-1" })).resolves.toMatchObject({ metadataFileCount: 1, assetPathCount: 1 });
    const manifest = JSON.parse(await readFile(path.join(fixtureRoot.archive, "archive-manifest.json"), "utf8"));
    expect(manifest.assetPaths).toEqual(["projects/p1/assets/a.bin"]);
    expect(JSON.parse(await readFile(path.join(fixtureRoot.archive, "projects/p1/project.json"), "utf8")).apiKey).toBe("[REDACTED]");
    await expect(readFile(path.join(fixtureRoot.archive, "projects/p1/assets/a.bin"))).rejects.toThrow();
  });

  it("rejects a non-empty target", async () => {
    const fixtureRoot = await fixture();
    await mkdir(fixtureRoot.archive, { recursive: true });
    await writeFile(path.join(fixtureRoot.archive, "keep"), "x");
    await expect(new MetadataArchiveService().archive({ workspaceRoot: fixtureRoot.workspace, archiveRoot: fixtureRoot.archive, marker: "m6-test-2" })).rejects.toMatchObject({ code: "ARCHIVE_TARGET_NOT_EMPTY" });
  });
});
