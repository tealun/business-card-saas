import { Body, Controller, Get, Post, Req, UseGuards } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { authCodeRequestSchema, qyLoginRequestSchema, switchIdentityRequestSchema } from "../contracts/auth.js";
import { EmployeeAuthGuard, type EmployeeRequest } from "../session/employee-auth.guard.js";
import { AuthService } from "./auth.service.js";

@Controller("auth")
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  /**
   * 企业微信小程序登录入口。
   *
   * 使用企业微信一次性 code 换取员工会话；限流按共享公网 IP 场景放宽。
   */
  @Post("qy-login")
  // 员工登录依赖短期一次性平台 code；企业同事可能共用 NAT，因此限流不能过低。
  @Throttle({ default: { ttl: 60_000, limit: 120 } })
  qyLogin(@Body() body: unknown) {
    return this.auth.qyLogin(qyLoginRequestSchema.parse(body));
  }

  /**
   * 微信个人账号登录入口。
   */
  @Post("wx-login")
  @Throttle({ default: { ttl: 60_000, limit: 120 } })
  wxLogin(@Body() body: unknown) {
    return this.auth.wxLogin(authCodeRequestSchema.parse(body));
  }

  /**
   * 获取当前账号可切换身份列表。
   */
  @Get("identities")
  @Throttle({ default: { ttl: 60_000, limit: 30 } })
  @UseGuards(EmployeeAuthGuard)
  identities(@Req() request: EmployeeRequest) {
    return this.auth.listIdentities(this.requireSession(request));
  }

  /**
   * 切换当前账号身份。
   */
  @Post("switch-identity")
  @Throttle({ default: { ttl: 60_000, limit: 20 } })
  @UseGuards(EmployeeAuthGuard)
  switchIdentity(@Req() request: EmployeeRequest, @Body() body: unknown) {
    return this.auth.switchIdentity(this.requireSession(request), switchIdentityRequestSchema.parse(body));
  }

  /**
   * 读取 EmployeeAuthGuard 注入的员工会话。
   */
  private requireSession(request: EmployeeRequest) {
    if (!request.employeeSession) {
      throw new Error("employee session missing after guard");
    }
    return request.employeeSession;
  }
}
