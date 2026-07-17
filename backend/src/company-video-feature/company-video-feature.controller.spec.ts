import { ForbiddenException } from "@nestjs/common";
import type { AdminSession } from "../admin-auth/admin-session.js";
import type { AdminRequest } from "../admin-auth/admin-auth.guard.js";
import { CompanyVideoFeatureController } from "./company-video-feature.controller.js";
import { CompanyVideoFeatureService } from "./company-video-feature.service.js";

// A71-P1-3: unlike the platform controller (whose role checks live in the service, per
// company-video-feature.service.spec.ts), the tenant controller calls requireTenantAdminRole
// directly at the route (company-video-feature.controller.ts:16) with no prior test coverage.
describe("CompanyVideoFeatureController", () => {
  const platformSession = {
    tenantId: "0",
    tenantName: "Platform",
    memberIdentityId: null,
    openUserid: "platform:root",
    role: "owner",
    accountType: "platform"
  } satisfies AdminSession;

  const tenantAuditor = {
    tenantId: "2",
    tenantName: "Pilot Corp",
    memberIdentityId: "member-001",
    openUserid: "ou-owner",
    role: "auditor",
    accountType: "tenant"
  } satisfies AdminSession;

  function requestFor(session: AdminSession): AdminRequest {
    return { adminSession: session };
  }

  it("rejects a platform-scoped session from the tenant capability route", () => {
    const service = { capability: jest.fn() } as unknown as CompanyVideoFeatureService;
    const controller = new CompanyVideoFeatureController(service);

    expect(() => controller.get(requestFor(platformSession))).toThrow(ForbiddenException);
    expect(service.capability).not.toHaveBeenCalled();
  });

  it("allows a tenant session at or above auditor to read capability", async () => {
    const service = { capability: jest.fn().mockResolvedValue({ enabled: true }) } as unknown as CompanyVideoFeatureService;
    const controller = new CompanyVideoFeatureController(service);

    await controller.get(requestFor(tenantAuditor));

    expect(service.capability).toHaveBeenCalledWith("2");
  });
});
