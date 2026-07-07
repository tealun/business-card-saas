import { UnauthorizedException } from "@nestjs/common";
import type { ExecutionContext } from "@nestjs/common";
import { EmployeeAuthGuard } from "./employee-auth.guard.js";
import { SessionTokenService } from "./session-token.service.js";
import type { EmployeeSession } from "./employee-session.js";

describe("EmployeeAuthGuard", () => {
  const service = new SessionTokenService();
  const guard = new EmployeeAuthGuard(service);

  const session: EmployeeSession = {
    accountId: "acct-001",
    tenantId: "tenant-001",
    tenantName: "Pilot Corp",
    memberIdentityId: "member-001",
    displayName: "Employee",
    openUserid: "ou-001",
    publicId: "pub_00000001"
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
