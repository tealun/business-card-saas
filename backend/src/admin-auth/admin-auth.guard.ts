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
    const request = context.switchToHttp().getRequest<AdminRequest & { headers: { authorization?: string } }>();
    const auth = request.headers.authorization;
    const token = auth?.startsWith("Bearer ") ? auth.slice("Bearer ".length) : undefined;
    if (!token) {
      throw new UnauthorizedException("admin access token required");
    }
    request.adminSession = this.sessionTokens.verify(token);
    return true;
  }
}
