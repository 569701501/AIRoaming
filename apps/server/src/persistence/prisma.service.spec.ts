import { describe, expect, it, vi } from "vitest";
import { PrismaService } from "./prisma.service.js";

function serviceWithState(activationState: string, firstBusinessWriteAt: Date | null = null) {
  const state = { id: "primary", activationState, firstBusinessWriteAt };
  const update = vi.fn(async ({ data }: { data: Record<string, unknown> }) => Object.assign(state, data));
  const tx = { persistenceState: { findUnique: vi.fn(async () => state), update } };
  const service = Object.create(PrismaService.prototype) as PrismaService;
  Object.defineProperty(service, "client", { value: { $transaction: (callback: (value: typeof tx) => Promise<unknown>) => callback(tx) } });
  return { service, state, update };
}

describe("PrismaService business write boundary", () => {
  it("keeps a consistent read transaction from consuming the first-write marker", async () => {
    const { service, state, update } = serviceWithState("db_only");
    await expect(service.runReadTransaction(async () => "read")).resolves.toBe("read");
    expect(update).not.toHaveBeenCalled();
    expect(state.firstBusinessWriteAt).toBeNull();
  });

  it("rejects read transactions before DB activation", async () => {
    const { service, update } = serviceWithState("ready_for_activation");
    await expect(service.runReadTransaction(async () => "never")).rejects.toThrow("DB_PERSISTENCE_NOT_ACTIVE");
    expect(update).not.toHaveBeenCalled();
  });

  it("marks the first DB-only business write inside the same transaction", async () => {
    const { service, state, update } = serviceWithState("db_only");
    await service.runBusinessTransaction(async () => "ok");
    expect(update).toHaveBeenCalledTimes(1);
    expect(state.firstBusinessWriteAt).toBeInstanceOf(Date);
  });

  it("does not leave a timestamp when the business transaction rolls back", async () => {
    const { service, state, update } = serviceWithState("db_only");
    await expect(service.runBusinessTransaction(async () => { throw new Error("rollback"); })).rejects.toThrow("rollback");
    expect(update).not.toHaveBeenCalled();
    expect(state.firstBusinessWriteAt).toBeNull();
  });

  it("rejects writes while ready_for_activation", async () => {
    const { service, update } = serviceWithState("ready_for_activation");
    await expect(service.runBusinessTransaction(async () => "never")).rejects.toThrow("DB_PERSISTENCE_NOT_ACTIVE");
    expect(update).not.toHaveBeenCalled();
  });

  it("rejects writes while recovery_required", async () => {
    const { service, update } = serviceWithState("recovery_required");
    await expect(service.runBusinessTransaction(async () => "never")).rejects.toThrow("DB_PERSISTENCE_NOT_ACTIVE");
    expect(update).not.toHaveBeenCalled();
  });

  it("does not overwrite an existing first-business-write timestamp", async () => {
    const first = new Date("2026-07-13T00:00:00.000Z");
    const { service, state, update } = serviceWithState("db_only", first);
    await service.runBusinessTransaction(async () => "later-write");
    expect(update).not.toHaveBeenCalled();
    expect(state.firstBusinessWriteAt).toBe(first);
  });
});
