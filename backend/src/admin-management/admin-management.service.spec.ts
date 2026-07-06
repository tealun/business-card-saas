import { ForbiddenException, NotFoundException } from "@nestjs/common";
import { EmployeeCardRepository } from "../employee/employee-card.repository.js";
import { EmployeeCardService } from "../employee/employee-card.service.js";
import { PublicCardRepository } from "../public-card/public-card.repository.js";
import type { AdminSession } from "../admin-auth/admin-session.js";
import {
  WecomContactSyncService,
  type SyncTenantContactMembersInput
} from "../wecom/wecom-contact-sync.service.js";
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
  });

  it("rejects cross-member access in the current MVP repository", async () => {
    const service = createService();

    await expect(service.getMemberCard(ownerSession(), "member-other")).rejects.toThrow(NotFoundException);
  });
});

function createService() {
  return new AdminManagementService(
    new EmployeeCardService(new EmployeeCardRepository(), new PublicCardRepository()),
    new AdminManagementRepository(),
    fakeContactSync()
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

function ownerSession(): AdminSession {
  return {
    tenantId: "tenant-001",
    tenantName: "Pilot Corp",
    memberIdentityId: "member-001",
    openUserid: "ou-owner",
    role: "owner"
  };
}
