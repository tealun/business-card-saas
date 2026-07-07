import { Controller, Get, Header } from "@nestjs/common";
import { collectDefaultMetrics, register } from "prom-client";

@Controller("metrics")
export class MetricsController {
  constructor() {
    collectDefaultMetrics({ register });
  }

  @Get()
  @Header("content-type", register.contentType)
  async getMetrics(): Promise<string> {
    return register.metrics();
  }
}
