import { Controller, Get } from "@nestjs/common";
import type { HealthResponse } from "@airoaming/shared";
import { ok } from "../http.js";

@Controller("health")
export class HealthController {
  @Get()
  check() {
    const data: HealthResponse = {
      service: "airoaming-server",
      status: "ok",
      version: "0.1.0",
      checkedAt: new Date().toISOString(),
    };

    return ok(data);
  }
}
