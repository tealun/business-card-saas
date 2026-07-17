import { UnauthorizedException } from "@nestjs/common";
import type { ExecutionContext } from "@nestjs/common";
import { AdminAuthGuard, type AdminRequest } from "./admin-auth.guard.js";
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

  it("attaches the client ip to the verified session for audit logging", () => {
    const token = service.sign(session);
    const request: AdminRequest & { headers: Record<string, string>; ip: string } = {
      headers: { authorization: `Bearer ${token}`, "x-forwarded-for": "203.0.113.9, 10.0.0.1" },
      ip: "127.0.0.1"
    };
    const context = {
      switchToHttp: () => ({
        getRequest: () => request
      })
    } as ExecutionContext;

    expect(guard.canActivate(context)).toBe(true);
    expect(request.adminSession?.requestIp).toBe("203.0.113.9");
  });

  it("falls back to the socket ip when no forwarding header exists", () => {
    const token = service.sign(session);
    const request: AdminRequest & { headers: Record<string, string>; ip: string } = {
      headers: { authorization: `Bearer ${token}` },
      ip: "198.51.100.4"
    };
    const context = {
      switchToHttp: () => ({
        getRequest: () => request
      })
    } as ExecutionContext;

    expect(guard.canActivate(context)).toBe(true);
    expect(request.adminSession?.requestIp).toBe("198.51.100.4");
  });

  it("throws when the authorization header is missing", () => {
    expect(() => guard.canActivate(context())).toThrow(UnauthorizedException);
  });

  it("throws when the token is malformed", () => {
    expect(() => guard.canActivate(context("Bearer not-a-token"))).toThrow(UnauthorizedException);
  });
});
