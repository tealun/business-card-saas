import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { AdminSessionTokenService } from "./admin-session-token.service.js";
import { PlatformAdminService } from "./platform-admin.service.js";
import type { AdminSession } from "./admin-session.js";

export interface AdminRequest {
  adminSession?: AdminSession;
}

@Injectable()
export class AdminAuthGuard implements CanActivate {
  constructor(
    private readonly sessionTokens: AdminSessionTokenService,
    private readonly platformAdmins: PlatformAdminService
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AdminRequest & { headers: { authorization?: string }; ip?: string }>();
    const auth = request.headers.authorization;
    const token = auth?.startsWith("Bearer ") ? auth.slice("Bearer ".length) : undefined;
    if (!token) {
      throw new UnauthorizedException("admin access token required");
    }
    const session = this.sessionTokens.verify(token);
    // M1-S7 (01_09 AC6): a signed token alone is not enough for platform
    // sessions -- re-check the account on every request so disabling or
    // deleting a platform admin revokes its outstanding 8h tokens immediately.
    if (session.accountType === "platform") {
      await this.platformAdmins.assertActiveSessionAccount(session);
    }
    // Attach the client IP for admin operation audit logging; it is request state,
    // not part of the signed token payload. request.ip is Fastify's own resolution,
    // which only honors X-Forwarded-For when the immediate peer is a trusted proxy
    // (trustProxy: "loopback" in main.ts) -- unlike parsing the header directly, a
    // client cannot spoof it by prepending an arbitrary value. See 99_71.
    session.requestIp = resolveClientIp(request);
    request.adminSession = session;
    return true;
  }
}

function resolveClientIp(request: { ip?: string }): string | undefined {
  const ip = request.ip?.trim();
  // admin_operation_logs.ip is VARCHAR(64).
  return ip ? ip.slice(0, 64) : undefined;
}
