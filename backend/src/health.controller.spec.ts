import { Test } from "@nestjs/testing";
import { HealthController } from "./health.controller.js";
import { DatabaseService } from "./database/database.service.js";

describe("HealthController", () => {
  async function createController(databaseStatus: { configured: boolean; ok: boolean }) {
    const moduleRef = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        {
          provide: DatabaseService,
          useValue: {
            ping: async () => databaseStatus
          }
        }
      ]
    }).compile();

    return moduleRef.get(HealthController);
  }

  it("returns ok from the root health endpoint", async () => {
    const controller = await createController({ configured: true, ok: true });
    expect(controller.getHealth()).toEqual({ ok: true, service: "business-card-api" });
  });

  it("returns ok from the liveness endpoint", async () => {
    const controller = await createController({ configured: true, ok: true });
    expect(controller.getLiveness()).toEqual({ ok: true, service: "business-card-api" });
  });

  it("returns readiness when the database is healthy", async () => {
    const controller = await createController({ configured: true, ok: true });
    await expect(controller.getReadiness()).resolves.toMatchObject({ ok: true, database: { ok: true } });
  });

  it("throws when the database is configured but not ready", async () => {
    const controller = await createController({ configured: true, ok: false });
    await expect(controller.getReadiness()).rejects.toThrow("database not ready");
  });

  it("returns readiness when the database is not configured", async () => {
    const controller = await createController({ configured: false, ok: false });
    await expect(controller.getReadiness()).resolves.toMatchObject({ ok: true });
  });
});
