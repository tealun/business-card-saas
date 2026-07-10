import { Controller, ForbiddenException, Get, Header, NotFoundException, Req } from "@nestjs/common";
import { timingSafeEqual } from "node:crypto";
import { collectDefaultMetrics, register } from "prom-client";
import { AppConfig } from "../config/app-config.js";

let defaultMetricsRegistered = false;

@Controller("metrics")
export class MetricsController {
  constructor(private readonly config: AppConfig) {
    // Register global default metrics once; a second controller instance must not
    // re-register (prom-client throws on duplicate metric names).
    if (!defaultMetricsRegistered) {
      collectDefaultMetrics({ register });
      defaultMetricsRegistered = true;
    }
  }

  @Get()
  @Header("content-type", register.contentType)
  async getMetrics(@Req() request: { headers: { authorization?: string } }): Promise<string> {
    // Disabled unless a scrape token is configured, then require it as a bearer token
    // so runtime metrics are never publicly exposed (A54-P1-1).
    const expected = this.config.metricsToken;
    if (!expected) {
      throw new NotFoundException();
    }
    const auth = request.headers.authorization;
    const provided = auth?.startsWith("Bearer ") ? auth.slice("Bearer ".length) : "";
    if (!safeEqual(provided, expected)) {
      throw new ForbiddenException("invalid metrics token");
    }
    return register.metrics();
  }
}

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}
