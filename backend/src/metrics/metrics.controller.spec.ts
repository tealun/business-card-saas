import { Test } from "@nestjs/testing";
import { MetricsController } from "./metrics.controller.js";

describe("MetricsController", () => {
  it("returns Prometheus metrics", async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [MetricsController]
    }).compile();

    const controller = moduleRef.get(MetricsController);
    const metrics = await controller.getMetrics();

    expect(typeof metrics).toBe("string");
    expect(metrics).toContain("nodejs_");
  });
});
