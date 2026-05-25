import type { ApiEnvelope } from "@airoaming/shared";

export function ok<T>(data: T): ApiEnvelope<T> {
  return {
    success: true,
    data,
  };
}
