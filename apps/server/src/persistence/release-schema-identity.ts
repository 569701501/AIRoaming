import { createHash } from "node:crypto";
import { lstat, readdir, readFile, realpath } from "node:fs/promises";
import path from "node:path";

import { digestCanonicalJson } from "@airoaming/shared";

export const RELEASE_PRISMA_SCHEMA_PATH =
  "apps/server/prisma/schema.prisma" as const;
export const RELEASE_MIGRATION_ROOT =
  "apps/server/prisma/migrations" as const;

export interface ReleaseSchemaIdentityV1 {
  readonly schemaVersion: 1;
  readonly kind: "airoaming_release_schema_identity_v1";
  readonly databaseEngine: "sqlite";
  readonly prismaSchema: {
    readonly path: typeof RELEASE_PRISMA_SCHEMA_PATH;
    readonly checksum: `sha256:${string}`;
  };
  readonly migrations: readonly {
    readonly name: string;
    readonly checksum: `sha256:${string}`;
  }[];
  readonly effectiveSchemaManifestDigest: `sha256:${string}`;
}

function sha256(bytes: Buffer): `sha256:${string}` {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

async function readReleaseArtifact(
  absolutePath: string,
  relativePath: string,
): Promise<Buffer> {
  let stat;
  try {
    stat = await lstat(absolutePath);
  } catch (cause) {
    throw new Error(`RELEASE_SCHEMA_ARTIFACT_UNAVAILABLE:${relativePath}`, {
      cause,
    });
  }
  if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1) {
    throw new Error(`RELEASE_SCHEMA_ARTIFACT_INVALID:${relativePath}`);
  }
  return readFile(absolutePath);
}

async function loadReleaseMigrations(
  canonicalRoot: string,
): Promise<ReleaseSchemaIdentityV1["migrations"]> {
  const migrationRoot = path.join(canonicalRoot, RELEASE_MIGRATION_ROOT);
  const stat = await lstat(migrationRoot).catch((cause: unknown) => {
    throw new Error("RELEASE_SCHEMA_MIGRATION_ROOT_UNAVAILABLE", { cause });
  });
  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    throw new Error("RELEASE_SCHEMA_MIGRATION_ROOT_INVALID");
  }
  const entries = await readdir(migrationRoot, { withFileTypes: true });
  const migrationNames = entries
    .filter((entry) => entry.isDirectory() || entry.isSymbolicLink())
    .map((entry) => {
      if (entry.isSymbolicLink() || !/^\d{4}_[a-z0-9_]+$/.test(entry.name)) {
        throw new Error(`RELEASE_SCHEMA_MIGRATION_ENTRY_INVALID:${entry.name}`);
      }
      return entry.name;
    })
    .sort();
  if (migrationNames.length === 0) {
    throw new Error("RELEASE_SCHEMA_MIGRATION_SET_EMPTY");
  }
  return Promise.all(
    migrationNames.map(async (name) => ({
      name,
      checksum: sha256(
        await readReleaseArtifact(
          path.join(migrationRoot, name, "migration.sql"),
          `${RELEASE_MIGRATION_ROOT}/${name}/migration.sql`,
        ),
      ),
    })),
  );
}

export async function loadReleaseSchemaIdentityV1(
  workspaceRoot: string,
): Promise<ReleaseSchemaIdentityV1> {
  const canonicalRoot = await realpath(path.resolve(workspaceRoot));
  const [prismaSchemaBytes, migrations] = await Promise.all([
    readReleaseArtifact(
      path.join(canonicalRoot, RELEASE_PRISMA_SCHEMA_PATH),
      RELEASE_PRISMA_SCHEMA_PATH,
    ),
    loadReleaseMigrations(canonicalRoot),
  ]);
  const identity = {
    schemaVersion: 1 as const,
    kind: "airoaming_release_schema_identity_v1" as const,
    databaseEngine: "sqlite" as const,
    prismaSchema: {
      path: RELEASE_PRISMA_SCHEMA_PATH,
      checksum: sha256(prismaSchemaBytes),
    },
    migrations,
  };
  return {
    ...identity,
    effectiveSchemaManifestDigest: digestCanonicalJson(identity),
  };
}
