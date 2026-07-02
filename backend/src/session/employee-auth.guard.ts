import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import type { EmployeeSession } from "./employee-session.js";
import { SessionTokenService } from "./session-token.service.js";

export interface EmployeeRequest {
  employeeSession?: EmployeeSession;
}

@Injectable()
export class EmployeeAuthGuard implements CanActivate {
  constructor(private readonly sessionTokens: SessionTokenService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<EmployeeRequest & { headers: { authorization?: string } }>();
    const auth = request.headers.authorization;
    const token = auth?.startsWith("Bearer ") ? auth.slice("Bearer ".length) : undefined;
    if (!token) {
      throw new UnauthorizedException("employee access token required");
    }
    request.employeeSession = this.sessionTokens.verify(token);
    return true;
  }
}
