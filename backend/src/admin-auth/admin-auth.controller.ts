import { Body, Controller, Get, Post, Put, Query, Req, UseGuards } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import {
  adminAuthCodeRequestSchema,
  adminChangePasswordRequestSchema,
  adminChangePasswordResponseSchema,
  adminPasswordLoginRequestSchema,
  adminWecomScanCallbackQuerySchema
} from "../contracts/admin-auth.js";
import { AdminAuthService } from "./admin-auth.service.js";
import { AdminAuthGuard, type AdminRequest } from "./admin-auth.guard.js";
import { PlatformAdminService } from "./platform-admin.service.js";
import { requireAdminSession } from "./admin-session.util.js";
import { AdminWecomScanAuthService } from "./admin-wecom-scan-auth.service.js";

@Controller("admin/auth")
export class AdminAuthController {
  constructor(
    private readonly auth: AdminAuthService,
    private readonly platformAdmins: PlatformAdminService,
    private readonly wecomScan: AdminWecomScanAuthService
  ) {}

  @Post("qy-login")
  @Throttle({ default: { ttl: 15 * 60 * 1000, limit: 5 } })
  qyLogin(@Body() body: unknown) {
    return this.auth.qyLogin(adminAuthCodeRequestSchema.parse(body));
  }

  @Post("login")
  @Throttle({ default: { ttl: 15 * 60 * 1000, limit: 5 } })
  passwordLogin(@Body() body: unknown) {
    return this.platformAdmins.passwordLogin(adminPasswordLoginRequestSchema.parse(body));
  }

  @Get("wecom/login-config")
  @Throttle({ default: { ttl: 15 * 60 * 1000, limit: 10 } })
  wecomLoginConfig(@Req() request: AdminRequest & { headers: { "user-agent"?: string }; ip?: string }, @Query("redirect_path") redirectPath?: string) {
    return this.wecomScan.loginConfig({
      clientIp: request.ip ?? null,
      userAgent: request.headers["user-agent"] ?? null,
      redirectPath: redirectPath ?? null
    });
  }

  @Get("wecom/scan-callback")
  @Throttle({ default: { ttl: 15 * 60 * 1000, limit: 10 } })
  wecomScanCallback(@Req() request: AdminRequest & { ip?: string }, @Query() query: unknown) {
    const input = adminWecomScanCallbackQuerySchema.parse(query);
    return this.wecomScan.completeScan({ ...input, clientIp: request.ip ?? null });
  }

  @Put("password")
  @UseGuards(AdminAuthGuard)
  @Throttle({ default: { ttl: 15 * 60 * 1000, limit: 5 } })
  async changePassword(@Req() request: AdminRequest, @Body() body: unknown) {
    await this.platformAdmins.changePassword(
      requireAdminSession(request),
      adminChangePasswordRequestSchema.parse(body)
    );
    return adminChangePasswordResponseSchema.parse({ changed: true });
  }
}
