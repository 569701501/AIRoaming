import { describe, expect, it } from "vitest";
import { MaintenanceCoordinator } from "../maintenance/maintenance-coordinator.service.js";
import { CutoverCoordinator } from "./cutover-coordinator.service.js";

describe("CutoverCoordinator", () => {
  it("enforces C0-C7 order and records sealed step evidence", async () => {
    const coordinator = new CutoverCoordinator();
    await expect(coordinator.runStep("C1", () => "wrong")).rejects.toMatchObject({ code: "CUTOVER_ORDER_INVALID" });
    for (const step of ["C0", "C1", "C2", "C3", "C4", "C5", "C6", "C7"] as const) await coordinator.runStep(step, () => `${step}-passed`);
    expect(coordinator.status().map((item) => item.step)).toEqual(["C0", "C1", "C2", "C3", "C4", "C5", "C6", "C7"]);
  });

  it("C1 drains, closes, and seals runtime state before advancing", async () => {
    const maintenance = new MaintenanceCoordinator();
    const coordinator = new CutoverCoordinator(maintenance);
    await coordinator.runStep("C0", () => "release-gates-passed");
    const result = await coordinator.closeMaintenance();
    expect(result.evidence.step).toBe("C1");
    expect(maintenance.getState()).toBe("closed");
  });
});
