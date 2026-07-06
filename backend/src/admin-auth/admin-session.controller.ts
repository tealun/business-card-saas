import { Controller, Get, Req, UseGuards } from "@nestjs/common";
import { AdminAuthGuard, type AdminRequest } from "./admin-auth.guard.js";
import { AdminAuthService } from "./admin-auth.service.js";

@Controller("admin/session")
export class AdminSessionController {
  constructor(private readonly auth: AdminAuthService) {}

  @Get("me")
  @UseGuards(AdminAuthGuard)
  me(@Req() request: AdminRequest) {
    if (!request.adminSession) {
      throw new Error("admin session missing after guard");
    }
    return this.auth.me(request.adminSession);
  }
}
