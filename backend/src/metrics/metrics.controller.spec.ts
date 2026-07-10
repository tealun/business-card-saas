import { ForbiddenException, NotFoundException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { AppConfig } from "../config/app-config.js";
import { MetricsController } from "./metrics.controller.js";

async function buildController(metricsToken: string): Promise<MetricsController> {
  const moduleRef = await Test.createTestingModule({
    controllers: [MetricsController],
    providers: [{ provide: AppConfig, useValue: { metricsToken } }]
  }).compile();
  return moduleRef.get(MetricsController);
}

function request(authorization?: string) {
  return { headers: authorization ? { authorization } : {} } as { headers: { authorization?: string } };
}

describe("MetricsController", () => {
  it("returns Prometheus metrics when the correct bearer token is presented", async () => {
    const controller = await buildController("scrape-secret");
    const metrics = await controller.getMetrics(request("Bearer scrape-secret"));

    expect(typeof metrics).toBe("string");
    expect(metrics).toContain("nodejs_");
  });

  it("is disabled (404) when no metrics token is configured", async () => {
    const controller = await buildController("");
    await expect(controller.getMetrics(request("Bearer anything"))).rejects.toBeInstanceOf(NotFoundException);
  });

  it("rejects a missing or wrong token with 403", async () => {
    const controller = await buildController("scrape-secret");
    await expect(controller.getMetrics(request())).rejects.toBeInstanceOf(ForbiddenException);
    await expect(controller.getMetrics(request("Bearer wrong"))).rejects.toBeInstanceOf(ForbiddenException);
  });
});
