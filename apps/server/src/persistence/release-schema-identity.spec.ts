import path from "node:path";
import { fileURLToPath } from "node:url";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";

import { describe, expect, it } from "vitest";

import { loadReleaseSchemaIdentityV1 } from "./release-schema-identity.js";

const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../..",
);

describe("release Schema identity", () => {
  it("identifies the current SQLite release from Prisma Schema and migrations 0001 through 0016", async () => {
    const identity = await loadReleaseSchemaIdentityV1(REPO_ROOT);

    expect(identity).toMatchObject({
      schemaVersion: 1,
      kind: "airoaming_release_schema_identity_v1",
      databaseEngine: "sqlite",
      prismaSchema: {
        path: "apps/server/prisma/schema.prisma",
        checksum: expect.stringMatching(/^sha256:[0-9a-f]{64}$/),
      },
    });
    expect(identity.migrations).toHaveLength(16);
    expect(identity.migrations[0]?.name).toBe("0001_persistence_and_migration");
    expect(identity.migrations.at(-1)?.name).toBe(
      "0016_g5_legacy_layout_cutover",
    );
    expect(identity.migrations.every((entry) => /^sha256:[0-9a-f]{64}$/.test(entry.checksum))).toBe(true);
    expect(identity.effectiveSchemaManifestDigest).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it("depends only on release artifacts and automatically includes a new ordered migration", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "airoaming-release-schema-"));
    try {
      const prismaRoot = path.join(root, "apps/server/prisma");
      await mkdir(path.join(prismaRoot, "migrations/0001_base"), { recursive: true });
      await writeFile(path.join(prismaRoot, "schema.prisma"), "datasource db { provider = \"sqlite\" url = env(\"DATABASE_URL\") }\n");
      await writeFile(path.join(prismaRoot, "migrations/0001_base/migration.sql"), "CREATE TABLE base (id TEXT PRIMARY KEY);\n");

      const beforePackageChange = await loadReleaseSchemaIdentityV1(root);
      await writeFile(path.join(root, "apps/server/package.json"), '{"scripts":{"unrelated":"changed"}}\n');
      const afterPackageChange = await loadReleaseSchemaIdentityV1(root);
      expect(afterPackageChange).toEqual(beforePackageChange);

      await mkdir(path.join(prismaRoot, "migrations/0002_overlay"));
      await writeFile(path.join(prismaRoot, "migrations/0002_overlay/migration.sql"), "CREATE INDEX base_id_idx ON base(id);\n");
      const withOverlay = await loadReleaseSchemaIdentityV1(root);
      expect(withOverlay.migrations.map((entry) => entry.name)).toEqual(["0001_base", "0002_overlay"]);
      expect(withOverlay.effectiveSchemaManifestDigest).not.toBe(beforePackageChange.effectiveSchemaManifestDigest);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
