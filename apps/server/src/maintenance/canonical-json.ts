import { createHash } from "node:crypto";

export function canonicalizeMaintenanceJson(value: unknown): string {
  if (value === null || typeof value === "boolean" || typeof value === "number" || typeof value === "string") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalizeMaintenanceJson).join(",")}]`;
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalizeMaintenanceJson(record[key])}`).join(",")}}`;
  }
  return JSON.stringify(String(value));
}

export function digestMaintenanceJson(value: unknown): `sha256:${string}` {
  return `sha256:${createHash("sha256").update(canonicalizeMaintenanceJson(value), "utf8").digest("hex")}`;
}

