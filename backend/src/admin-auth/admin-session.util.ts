import { UnauthorizedException } from "@nestjs/common";
import type { AdminSession } from "./admin-session.js";
import type { AdminRequest } from "./admin-auth.guard.js";

export function requireAdminSession(request: AdminRequest): AdminSession {
  if (!request.adminSession) {
    throw new UnauthorizedException("admin session missing after guard");
  }
  return request.adminSession;
}
