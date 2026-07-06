import { Controller, Get, ServiceUnavailableException } from "@nestjs/common";
import { DatabaseService } from "./database/database.service.js";

@Controller("health")
export class HealthController {
  constructor(private readonly database: DatabaseService) {}

  @Get()
  getHealth() {
    return {
      ok: true,
      service: "business-card-api"
    };
  }

  // Readiness: liveness is not enough to route DB-backed traffic (A12-P2-3).
  @Get("ready")
  async getReadiness() {
    const database = await this.database.ping();
    if (database.configured && !database.ok) {
      throw new ServiceUnavailableException("database not ready");
    }
    return {
      ok: true,
      service: "business-card-api",
      database
    };
  }
}
