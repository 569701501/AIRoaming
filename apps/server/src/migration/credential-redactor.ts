const SECRET_KEY = /(?:api[-_]?key|access[-_]?token|refresh[-_]?token|auth(?:orization)?|cookie|password|secret|credential|private[-_]?key)/i;
const SECRET_VALUE = /(?:bearer\s+|sk-[a-z0-9_-]{8,}|gh[pousr]_[a-z0-9_-]{8,}|xai-[a-z0-9_-]{8,})/i;
const SECRET_SENTINEL = /airoaming-test-secret-[a-z0-9._:-]+|\bsk-[a-z0-9]{8,}\b|\bbearer\s+[a-z0-9._~+/=-]+/i;

export interface RedactionResult {
  value: unknown;
  redactedCount: number;
}

export function containsSecretSentinel(value: unknown, seen = new Set<object>()): boolean {
  if (Buffer.isBuffer(value)) return SECRET_SENTINEL.test(value.toString("utf8"));
  if (value instanceof Uint8Array) return SECRET_SENTINEL.test(Buffer.from(value).toString("utf8"));
  if (typeof value === "string") return SECRET_SENTINEL.test(value);
  if (Array.isArray(value)) return value.some((item) => containsSecretSentinel(item, seen));
  if (value && typeof value === "object") {
    if (seen.has(value)) return false;
    seen.add(value);
    return Object.values(value).some((item) => containsSecretSentinel(item, seen));
  }
  return false;
}

export function assertNoSecretSentinel(value: unknown): void {
  if (containsSecretSentinel(value)) throw new Error("SECRET_SENTINEL_DETECTED");
}

export function redactCredentials(value: unknown): RedactionResult {
  let redactedCount = 0;

  const visit = (current: unknown, key: string | null): unknown => {
    if (typeof current === "string") {
      if (key && SECRET_KEY.test(key)) {
        if (current.trim()) redactedCount += 1;
        return current.trim() ? "[REDACTED]" : current;
      }
      if (SECRET_VALUE.test(current) || SECRET_SENTINEL.test(current)) {
        throw new Error("SNAPSHOT_SECRET_DETECTED");
      }
      return current;
    }
    if (Array.isArray(current)) return current.map((item) => visit(item, key));
    if (current && typeof current === "object") {
      const record = current as Record<string, unknown>;
      return Object.fromEntries(Object.entries(record).map(([childKey, childValue]) => [childKey, visit(childValue, childKey)]));
    }
    return current;
  };

  return { value: visit(value, null), redactedCount };
}
