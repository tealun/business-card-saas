import { ForbiddenException } from "@nestjs/common";
import type { AdminSession } from "../admin-auth/admin-session.js";
import { AdminCommercialService } from "./admin-commercial.service.js";

describe("AdminCommercialService", () => {
  const tenantSession = {
    accountType: "tenant",
    tenantId: "1",
    tenantName: "Pilot",
    memberIdentityId: "10",
    openUserid: "ou",
    role: "owner"
  } satisfies AdminSession;
  const platformSession = { ...tenantSession, accountType: "platform", openUserid: "platform:root" } satisfies AdminSession;

  it("allows tenant admins to read their commercial snapshot", async () => {
    const repository = { tenantCommercial: jest.fn().mockResolvedValue(tenantSnapshot()) };
    const service = new AdminCommercialService(repository as never);
    await expect(service.tenantCommercial(tenantSession)).resolves.toMatchObject({ subscription: { plan: { plan_key: "free" } } });
  });

  it("allows tenant auditors and legacy tokens without accountType to read the commercial snapshot", async () => {
    const repository = { tenantCommercial: jest.fn().mockResolvedValue(tenantSnapshot()) };
    const service = new AdminCommercialService(repository as never);
    const auditor = { ...tenantSession, role: "auditor" } satisfies AdminSession;
    const legacyAdmin: AdminSession = {
      tenantId: "1",
      tenantName: "Pilot",
      memberIdentityId: "10",
      openUserid: "ou-admin",
      role: "admin"
    };
    await expect(service.tenantCommercial(auditor)).resolves.toMatchObject({ subscription: { plan: { plan_key: "free" } } });
    await expect(service.tenantCommercial(legacyAdmin)).resolves.toMatchObject({ subscription: { plan: { plan_key: "free" } } });
  });

  it("rejects tenant operators from the commercial snapshot", async () => {
    const repository = { tenantCommercial: jest.fn().mockResolvedValue(tenantSnapshot()) };
    const service = new AdminCommercialService(repository as never);
    const operator = { ...tenantSession, role: "operator" } satisfies AdminSession;
    await expect(service.tenantCommercial(operator)).rejects.toThrow(ForbiddenException);
  });

  it("rejects platform sessions from the tenant commercial snapshot", async () => {
    const repository = { tenantCommercial: jest.fn().mockResolvedValue(tenantSnapshot()) };
    const service = new AdminCommercialService(repository as never);
    await expect(service.tenantCommercial(platformSession)).rejects.toThrow("tenant administrator required");
  });

  it("restricts platform commercial snapshot to platform owners", async () => {
    const repository = { platformCommercial: jest.fn().mockResolvedValue({ plans: [], subscriptions: [], orders: [] }) };
    const service = new AdminCommercialService(repository as never);
    await expect(service.platformCommercial(platformSession)).resolves.toEqual({ plans: [], subscriptions: [], orders: [] });
    await expect(service.platformCommercial(tenantSession)).rejects.toThrow("platform administrator required");
  });
});

function tenantSnapshot() {
  return {
    subscription: {
      subscription_id: null,
      plan: { plan_key: "free", name: "Free", status: "active", billing_period: "monthly", price_cents: 0, currency: "CNY", member_limit: 50, card_limit: 50, video_limit_bytes: 0 },
      status: "inactive",
      started_at: null,
      expires_at: null,
      usage: { member_count: 0, active_card_count: 0, video_count: 0 },
      quota_adjustments: { member: 0, card: 0, video_mb: 0 }
    },
    orders: [],
    quota_ledger: []
  };
}
