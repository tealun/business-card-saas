import { Controller, Get, Req, UseGuards } from "@nestjs/common";
import { AdminAuthGuard, type AdminRequest } from "./admin-auth.guard.js";
import { AdminAuthService } from "./admin-auth.service.js";
import { requireAdminSession } from "./admin-session.util.js";

@Controller("admin/session")
export class AdminSessionController {
  constructor(private readonly auth: AdminAuthService) {}

  @Get("me")
  @UseGuards(AdminAuthGuard)
  me(@Req() request: AdminRequest) {
    return this.auth.me(requireAdminSession(request));
  }
}
