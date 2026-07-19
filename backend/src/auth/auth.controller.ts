import { Body, Controller, Get, Post, Req, UseGuards } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { authCodeRequestSchema, qyLoginRequestSchema, switchIdentityRequestSchema } from "../contracts/auth.js";
import { EmployeeAuthGuard, type EmployeeRequest } from "../session/employee-auth.guard.js";
import { AuthService } from "./auth.service.js";

@Controller("auth")
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post("qy-login")
  // Employee logins are backed by short-lived, one-time platform codes. Use a
  // shared-IP-safe ceiling; many coworkers can legitimately sit behind one NAT.
  @Throttle({ default: { ttl: 60_000, limit: 120 } })
  qyLogin(@Body() body: unknown) {
    return this.auth.qyLogin(qyLoginRequestSchema.parse(body));
  }

  @Post("wx-login")
  @Throttle({ default: { ttl: 60_000, limit: 120 } })
  wxLogin(@Body() body: unknown) {
    return this.auth.wxLogin(authCodeRequestSchema.parse(body));
  }

  @Get("identities")
  @Throttle({ default: { ttl: 60_000, limit: 30 } })
  @UseGuards(EmployeeAuthGuard)
  identities(@Req() request: EmployeeRequest) {
    return this.auth.listIdentities(this.requireSession(request));
  }

  @Post("switch-identity")
  @Throttle({ default: { ttl: 60_000, limit: 20 } })
  @UseGuards(EmployeeAuthGuard)
  switchIdentity(@Req() request: EmployeeRequest, @Body() body: unknown) {
    return this.auth.switchIdentity(this.requireSession(request), switchIdentityRequestSchema.parse(body));
  }

  private requireSession(request: EmployeeRequest) {
    if (!request.employeeSession) {
      throw new Error("employee session missing after guard");
    }
    return request.employeeSession;
  }
}
