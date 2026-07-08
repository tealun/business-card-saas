import { Body, Controller, Get, Post, Req, UseGuards } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { authCodeRequestSchema, switchIdentityRequestSchema } from "../contracts/auth.js";
import { EmployeeAuthGuard, type EmployeeRequest } from "../session/employee-auth.guard.js";
import { AuthService } from "./auth.service.js";

@Controller("auth")
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post("qy-login")
  @Throttle({ login: { ttl: 15 * 60 * 1000, limit: 5 } })
  qyLogin(@Body() body: unknown) {
    return this.auth.qyLogin(authCodeRequestSchema.parse(body));
  }

  @Post("wx-login")
  @Throttle({ login: { ttl: 15 * 60 * 1000, limit: 5 } })
  wxLogin(@Body() body: unknown) {
    return this.auth.wxLogin(authCodeRequestSchema.parse(body));
  }

  @Get("identities")
  @UseGuards(EmployeeAuthGuard)
  identities(@Req() request: EmployeeRequest) {
    return this.auth.listIdentities(this.requireSession(request));
  }

  @Post("switch-identity")
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
