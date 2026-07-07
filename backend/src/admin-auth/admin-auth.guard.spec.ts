import { UnauthorizedException } from "@nestjs/common";
import type { ExecutionContext } from "@nestjs/common";
import { AdminAuthGuard } from "./admin-auth.guard.js";
import { AdminSessionTokenService } from "./admin-session-token.service.js";
import type { AdminSession } from "./admin-session.js";

describe("AdminAuthGuard", () => {
  const service = new AdminSessionTokenService();
  const guard = new AdminAuthGuard(service);

  const session: AdminSession = {
    tenantId: "tenant-001",
    tenantName: "Pilot Corp",
    memberIdentityId: "member-001",
    openUserid: "ou-owner",
    role: "owner"
  };

  function context(auth?: string): ExecutionContext {
    return {
      switchToHttp: () => ({
        getRequest: () => ({ headers: { authorization: auth } })
      })
    } as ExecutionContext;
  }

  it("allows requests with a valid bearer token", () => {
    const token = service.sign(session);
    expect(guard.canActivate(context(`Bearer ${token}`))).toBe(true);
  });

  it("throws when the authorization header is missing", () => {
    expect(() => guard.canActivate(context())).toThrow(UnauthorizedException);
  });

  it("throws when the token is malformed", () => {
    expect(() => guard.canActivate(context("Bearer not-a-token"))).toThrow(UnauthorizedException);
  });
});
