import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { AdminSessionTokenService } from "./admin-session-token.service.js";
import type { AdminSession } from "./admin-session.js";

export interface AdminRequest {
  adminSession?: AdminSession;
}

@Injectable()
export class AdminAuthGuard implements CanActivate {
  constructor(private readonly sessionTokens: AdminSessionTokenService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context
      .switchToHttp()
      .getRequest<AdminRequest & { headers: { authorization?: string; "x-forwarded-for"?: string | string[] }; ip?: string }>();
    const auth = request.headers.authorization;
    const token = auth?.startsWith("Bearer ") ? auth.slice("Bearer ".length) : undefined;
    if (!token) {
      throw new UnauthorizedException("admin access token required");
    }
    const session = this.sessionTokens.verify(token);
    // Attach the client IP for admin operation audit logging; it is request state,
    // not part of the signed token payload.
    session.requestIp = resolveClientIp(request);
    request.adminSession = session;
    return true;
  }
}

function resolveClientIp(request: { headers: { "x-forwarded-for"?: string | string[] }; ip?: string }): string | undefined {
  const forwarded = request.headers["x-forwarded-for"];
  const first = Array.isArray(forwarded) ? forwarded[0] : forwarded?.split(",")[0];
  const ip = (first ?? request.ip)?.trim();
  // admin_operation_logs.ip is VARCHAR(64).
  return ip ? ip.slice(0, 64) : undefined;
}
