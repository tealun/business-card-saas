import { ForbiddenException } from "@nestjs/common";
import type { AdminSession } from "../admin-auth/admin-session.js";
import { AdminAnalyticsService } from "./admin-analytics.service.js";

describe("AdminAnalyticsService", () => {
  it("returns parsed tenant analytics from the repository", async () => {
    const repository = {
      getTenantAnalytics: jest.fn().mockResolvedValue(analyticsPayload())
    };
    const service = new AdminAnalyticsService(repository as never);

    await expect(service.getTenantAnalytics(adminSession(), { days: 7 })).resolves.toMatchObject({
      overview: { visit_count: 12, visitor_count: 7 },
      trend: [{ date: "2026-07-16" }],
      member_rank: [{ display_name: "Alice" }],
      action_types: [{ action_type: "like_card" }]
    });
    expect(repository.getTenantAnalytics).toHaveBeenCalledWith(adminSession(), { days: 7 });
  });

  it("passes the requested 30 day trend window to the repository", async () => {
    const repository = {
      getTenantAnalytics: jest.fn().mockResolvedValue(analyticsPayload())
    };
    const service = new AdminAnalyticsService(repository as never);

    await service.getTenantAnalytics(adminSession(), { days: 30 });

    expect(repository.getTenantAnalytics).toHaveBeenCalledWith(adminSession(), { days: 30 });
  });

  it("rejects platform sessions from tenant analytics", async () => {
    const repository = {
      getTenantAnalytics: jest.fn().mockResolvedValue(analyticsPayload())
    };
    const service = new AdminAnalyticsService(repository as never);
    const platformSession: AdminSession = { ...adminSession(), accountType: "platform" };

    await expect(service.getTenantAnalytics(platformSession, { days: 7 })).rejects.toThrow(ForbiddenException);
  });
});

function analyticsPayload() {
  return {
    overview: {
      visit_count: 12,
      visitor_count: 7,
      action_count: 3,
      share_count: 2,
      active_card_count: 5
    },
    trend: [{ date: "2026-07-16", visit_count: 12, action_count: 3 }],
    member_rank: [
      {
        member_identity_id: "10",
        display_name: "Alice",
        public_id: "pub_1",
        visit_count: 9,
        visitor_count: 6,
        action_count: 2
      }
    ],
    action_types: [{ action_type: "like_card", action_count: 3 }]
  };
}

function adminSession(): AdminSession {
  return {
    accountType: "tenant",
    tenantId: "1",
    tenantName: "Pilot Corp",
    memberIdentityId: "10",
    openUserid: "ou-admin",
    role: "admin"
  };
}
