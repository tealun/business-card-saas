import { ForbiddenException, NotFoundException } from "@nestjs/common";
import { EmployeeCardRepository } from "../employee/employee-card.repository.js";
import { EmployeeCardService } from "../employee/employee-card.service.js";
import { PublicCardRepository } from "../public-card/public-card.repository.js";
import type { AdminSession } from "../admin-auth/admin-session.js";
import {
  WecomContactSyncService,
  type SyncTenantContactMembersInput
} from "../wecom/wecom-contact-sync.service.js";
import { WecomDataCallbackService } from "../wecom/wecom-data-callback.service.js";
import { AdminManagementRepository } from "./admin-management.repository.js";
import { AdminManagementService } from "./admin-management.service.js";

describe("AdminManagementService", () => {
  it("returns overview and current tenant member summary", async () => {
    const service = createService();
    const overview = await service.getOverview(ownerSession());
    const members = await service.listMembers(ownerSession());

    expect(overview).toEqual({
      tenant_id: "tenant-001",
      tenant_name: "Pilot Corp",
      member_count: 1,
      card_count: 1,
      active_card_count: 1
    });
    expect(members.total).toBe(1);
    expect(members.items[0]?.member_identity_id).toBe("member-001");
  });

  it("filters fallback member summaries with the shared list query contract", async () => {
    const service = createService();

    await expect(
      service.listMembers(ownerSession(), { search: "missing", status: "all", limit: 50, offset: 0 })
    ).resolves.toEqual({ items: [], total: 0 });
    await expect(
      service.listMembers(ownerSession(), { search: "owner", status: "disabled", limit: 50, offset: 0 })
    ).resolves.toEqual({ items: [], total: 0 });
  });

  it("syncs members when the admin has admin or higher permission", async () => {
    const service = createService();

    const result = await service.syncMembers(ownerSession());

    expect(result).toEqual({
      tenant_id: "tenant-001",
      synced_count: 2,
      skipped_count: 0
    });
  });

  it("returns an empty sync event list when persistence is not configured", async () => {
    const service = createService();

    await expect(service.listSyncEvents(ownerSession())).resolves.toEqual({ items: [], total: 0 });
  });

  it("retries failed sync events when the admin has admin or higher permission", async () => {
    const dataCallbacks = fakeDataCallbacks();
    const service = createService(new AdminManagementRepository(), dataCallbacks);

    await expect(service.retryFailedSyncEvents(ownerSession())).resolves.toEqual({
      retried_count: 2,
      succeeded_count: 1,
      failed_count: 1,
      dead_count: 1
    });
    expect(dataCallbacks.retryCalls).toBe(1);
    expect(dataCallbacks.lastRetry?.tenantId).toBe("tenant-001");
  });

  it("updates a member card when the admin has operator or higher permission", async () => {
    const service = createService();

    const card = await service.updateMemberCard(ownerSession(), "member-001", {
      display_name: "Configured Name",
      title: "Sales Lead",
      fields: { email: "configured@example.com" },
      status: "disabled"
    });

    expect(card.display_name).toBe("Configured Name");
    expect(card.title).toBe("Sales Lead");
    expect(card.fields.email).toBe("configured@example.com");
    expect(card.status).toBe("disabled");
    const saved = await service.getMemberCard(ownerSession(), "member-001");
    expect(saved.display_name).toBe("Configured Name");
    expect(saved.status).toBe("disabled");
  });

  it("rejects write and sync attempts from read-only auditors", async () => {
    const service = createService();

    await expect(
      service.updateMemberCard({ ...ownerSession(), role: "auditor" }, "member-001", {
        display_name: "Nope"
      })
    ).rejects.toThrow(ForbiddenException);
    await expect(service.syncMembers({ ...ownerSession(), role: "auditor" })).rejects.toThrow(ForbiddenException);
    await expect(service.retryFailedSyncEvents({ ...ownerSession(), role: "auditor" })).rejects.toThrow(
      ForbiddenException
    );
  });

  it("rejects cross-member access in the current MVP repository", async () => {
    const service = createService();

    await expect(service.getMemberCard(ownerSession(), "member-other")).rejects.toThrow(NotFoundException);
  });

  it("does not fall back to in-memory cards when persistence is configured but the member is missing", async () => {
    const service = createService({
      getMemberCard: async () => null,
      updateMemberCard: async () => null,
      isDatabaseConfigured: () => true
    } as unknown as AdminManagementRepository);

    await expect(service.getMemberCard(ownerSession(), "member-001")).rejects.toThrow(NotFoundException);
    await expect(
      service.updateMemberCard(ownerSession(), "member-001", {
        display_name: "Ghost Card"
      })
    ).rejects.toThrow(NotFoundException);
  });
});

function createService(repository = new AdminManagementRepository(), dataCallbacks = fakeDataCallbacks()) {
  return new AdminManagementService(
    new EmployeeCardService(new EmployeeCardRepository(), new PublicCardRepository()),
    repository,
    fakeContactSync(),
    dataCallbacks as unknown as WecomDataCallbackService
  );
}

function fakeContactSync(): WecomContactSyncService {
  return {
    syncTenantMembers: async (input: SyncTenantContactMembersInput) => ({
      tenantId: input.tenantId,
      syncedCount: 2,
      skippedCount: 0
    })
  } as WecomContactSyncService;
}

function fakeDataCallbacks() {
  return {
    retryCalls: 0,
    lastRetry: null as { tenantId?: string } | null,
    async retryFailedEvents(input?: { tenantId?: string }) {
      this.retryCalls += 1;
      this.lastRetry = input ?? null;
      return {
        retriedCount: 2,
        succeededCount: 1,
        failedCount: 1,
        deadCount: 1
      };
    }
  };
}

function ownerSession(): AdminSession {
  return {
    tenantId: "tenant-001",
    tenantName: "Pilot Corp",
    memberIdentityId: "member-001",
    openUserid: "ou-owner",
    role: "owner"
  };
}
