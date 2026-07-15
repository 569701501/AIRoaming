import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  assertG5LegacyLayoutCutoverSqlShape,
  G5_LEGACY_LAYOUT_CUTOVER_MIGRATION_NAME,
  readG5LegacyLayoutCutoverSql,
} from "./g5-legacy-layout-cutover-contract.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const migrationRoot = path.join(repoRoot, "apps/server/prisma/migrations");

describe("G5 legacy layout cutover overlay", () => {
  it("allows only the one-way legacy Working Copy to LayoutDocument V1 transition", async () => {
    expect(G5_LEGACY_LAYOUT_CUTOVER_MIGRATION_NAME).toBe("0016_g5_legacy_layout_cutover");
    const sql = await readG5LegacyLayoutCutoverSql(migrationRoot);
    expect(() => assertG5LegacyLayoutCutoverSqlShape(sql)).not.toThrow();
    expect(sql).not.toContain("layout_document_v1'\n        AND NEW.\"document_kind\" = 'legacy_chapter_layout_v1");
  });
});
