import { describe, expect, it } from "vitest";
import { readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  COMPOSITE_SOURCE_ENTITY_TYPES,
  RUNTIME_BUNDLE_SOURCE_ENTITY_TYPES,
  SINGLE_ITEM_SOURCE_ENTITY_TYPES,
} from "./migration-source-evidence.registry.js";

describe("migration source evidence registry", () => {
  it("keeps source strategies mutually exclusive", () => {
    const categories = [
      SINGLE_ITEM_SOURCE_ENTITY_TYPES,
      COMPOSITE_SOURCE_ENTITY_TYPES,
      RUNTIME_BUNDLE_SOURCE_ENTITY_TYPES,
    ];
    for (let left = 0; left < categories.length; left += 1) {
      for (let right = left + 1; right < categories.length; right += 1) {
        for (const entityType of categories[left]) {
          expect(categories[right].has(entityType), `${entityType} is registered twice`).toBe(false);
        }
      }
    }
  });

  it("keeps Chapter on the composite algorithm path", () => {
    expect(SINGLE_ITEM_SOURCE_ENTITY_TYPES.has("Chapter")).toBe(false);
    expect(COMPOSITE_SOURCE_ENTITY_TYPES.has("Chapter")).toBe(true);
  });

  it("registers every entity type written by a shadow importer", async () => {
    const directory = dirname(fileURLToPath(import.meta.url));
    const importerFiles = (await readdir(directory)).filter((name) => name.endsWith("-shadow-importer.ts"));
    const importedEntityTypes = new Set<string>();
    for (const file of importerFiles) {
      const source = await readFile(join(directory, file), "utf8");
      for (const match of source.matchAll(/recordImportedEntitySourceInTransaction\([\s\S]{0,800}?entityType:\s*"([^"]+)"/g)) {
        importedEntityTypes.add(match[1]);
      }
    }
    const registeredEntityTypes = new Set([
      ...SINGLE_ITEM_SOURCE_ENTITY_TYPES,
      ...COMPOSITE_SOURCE_ENTITY_TYPES,
      ...RUNTIME_BUNDLE_SOURCE_ENTITY_TYPES,
    ]);
    expect([...importedEntityTypes].filter((entityType) => !registeredEntityTypes.has(entityType))).toEqual([]);
    expect([...registeredEntityTypes].filter((entityType) => !importedEntityTypes.has(entityType))).toEqual([]);
  });
});
