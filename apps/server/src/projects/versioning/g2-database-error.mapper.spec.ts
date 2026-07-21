import { describe, expect, it } from "vitest";

import { mapG2DatabaseError } from "./g2-database-error.mapper.js";

describe("G2 database error mapper", () => {
  it("maps fixed trigger families to stable HTTP/domain codes", () => {
    expect(mapG2DatabaseError(new Error("AIR_G2:trg_g2_generation_tasks_new_work_gate_seal"))).toMatchObject({
      status: 409,
      code: "UPSTREAM_WORK_NOT_CONFIRMED",
    });
    expect(mapG2DatabaseError(new Error("AIR_G2:trg_g2_shots_retired_monotonic_update"))).toMatchObject({
      status: 409,
      code: "SHOT_ID_RETIRED",
    });
    expect(mapG2DatabaseError(new Error("AIR_G2:trg_g2_story_versions_pending_v2_insert"))).toMatchObject({
      status: 400,
      code: "VERSION_CODEC_UPGRADE_REQUIRED",
    });
    expect(mapG2DatabaseError(new Error("AIR_G2:unknown_future_trigger"))).toMatchObject({
      status: 500,
      code: "G2_DATABASE_CONTRACT_VIOLATION",
    });
  });
});
