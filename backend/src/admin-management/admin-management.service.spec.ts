import { ForbiddenException, NotFoundException } from "@nestjs/common";
import type { AdminSession } from "../admin-auth/admin-session.js";
import type {
  AdminMemberCardResponse,
  AdminMemberListQuery,
  UpdateAdminMemberCardRequest
} from "../contracts/admin-management.js";
import {
  WecomContactSyncService,
  type SyncTenantContactMembersInput
} from "../wecom/wecom-contact-sync.service.js";
import { WecomDataCallbackService } from "../wecom/wecom-data-callback.service.js";
import { WecomAuthorizationService } from "../wecom/wecom-authorization.service.js";
import { WecomTenantSettingsRepository } from "../wecom/wecom-tenant-settings.repository.js";
import { AdminManagementRepository } from "./admin-management.repository.js";
import { AdminManagementService } from "./admin-management.service.js";

describe("AdminManagementService", () => {
  it("returns overview and current tenant member summary", async () => {
    const service = createService();
    const overview = await service.getOverview(ownerSession());
    const members = await service.listMembers(ownerSession(), defaultQuery());

    expect(overview).toEqual({
      tenant_id: "tenant-001",
      tenant_name: "Pilot Corp",
      member_count: 1,
      card_count: 1,
      active_card_count: 1
    });
    expect(members.total).toBe(1);
    expect(members.items[0]?.member_identity_id).toBe("member-001");
    expect(members.items[0]?.department).toBe("技术部");
  });

  it("filters member summaries with the shared list query contract", async () => {
    const service = createService();

    await expect(
      service.listMembers(ownerSession(), { search: "missing", status: "all", limit: 50, offset: 0 })
    ).resolves.toEqual({ items: [], total: 0 });
    await expect(
      service.listMembers(ownerSession(), { search: "owner", status: "disabled", limit: 50, offset: 0 })
    ).resolves.toEqual({ items: [], total: 0 });
  });

  it("rejects platform sessions on tenant member endpoints while legacy tokens still work", async () => {
    const service = createService();
    const platformSession: AdminSession = { ...ownerSession(), openUserid: "platform:root", accountType: "platform" };

    await expect(service.listMembers(platformSession, defaultQuery())).rejects.toThrow(ForbiddenException);
    await expect(service.getOverview(platformSession)).rejects.toThrow(ForbiddenException);
    await expect(service.listMembers(ownerSession(), defaultQuery())).resolves.toMatchObject({ total: 1 });
  });

  it("syncs members when the admin has admin or higher permission", async () => {
    const service = createService();

    const result = await service.syncMembers(ownerSession());

    expect(result).toEqual({
      tenant_id: "tenant-001",
      synced_count: 2,
      skipped_count: 0,
      disabled_count: 0,
      detail_synced_count: 2,
      detail_missing_count: 0
    });
  });

  it("records an operation log after a successful member sync", async () => {
    const operationLogs = { record: jest.fn().mockResolvedValue(undefined) };
    const service = createService(fakeRepository(), fakeDataCallbacks(), fakeAuthorization(), operationLogs);

    await service.syncMembers(ownerSession());

    expect(operationLogs.record).toHaveBeenCalledWith({
      session: ownerSession(),
      action: "member.sync",
      detail: { synced_count: 2, skipped_count: 0, disabled_count: 0, detail_synced_count: 2, detail_missing_count: 0 }
    });
  });

  it("returns an empty sync event list when persistence is not configured", async () => {
    const service = createService();

    await expect(service.listSyncEvents(ownerSession())).resolves.toEqual({ items: [], total: 0 });
  });

  it("retries failed sync events when the admin has admin or higher permission", async () => {
    const dataCallbacks = fakeDataCallbacks();
    const authorization = fakeAuthorization();
    const service = createService(fakeRepository(), dataCallbacks, authorization);

    await expect(service.retryFailedSyncEvents(ownerSession())).resolves.toEqual({
      retried_count: 3,
      succeeded_count: 2,
      failed_count: 1,
      dead_count: 1
    });
    expect(dataCallbacks.retryCalls).toBe(1);
    expect(dataCallbacks.lastRetry?.tenantId).toBe("tenant-001");
    expect(authorization.retryCalls).toBe(1);
    expect(authorization.lastRetry?.tenantId).toBe("tenant-001");
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
      updateMemberCard: async () => null
    } as unknown as AdminManagementRepository);

    await expect(service.getMemberCard(ownerSession(), "member-001")).rejects.toThrow(NotFoundException);
    await expect(
      service.updateMemberCard(ownerSession(), "member-001", {
        display_name: "Ghost Card"
      })
    ).rejects.toThrow(NotFoundException);
  });
});

function createService(
  repository: AdminManagementRepository = fakeRepository(),
  dataCallbacks = fakeDataCallbacks(),
  authorization = fakeAuthorization(),
  operationLogs?: { record: jest.Mock }
): AdminManagementService {
  return new AdminManagementService(
    repository,
    fakeContactSync(),
    dataCallbacks as unknown as WecomDataCallbackService,
    authorization as unknown as WecomAuthorizationService,
    new WecomTenantSettingsRepository(),
    operationLogs as never
  );
}

function defaultQuery(): AdminMemberListQuery {
  return { search: "", status: "all", limit: 50, offset: 0 };
}

function fakeRepository(): AdminManagementRepository {
  const overview = {
    tenant_id: "tenant-001",
    tenant_name: "Pilot Corp",
    member_count: 1,
    card_count: 1,
    active_card_count: 1
  };
  const memberItem = {
    member_identity_id: "member-001",
    userid: null,
    open_userid: "ou-owner",
    display_name: "Owner Name",
    status: "active" as const,
    public_id: "pub_owner001",
    department: "技术部",
    title: "Sales Lead",
    mobile: null,
    email: null,
    card_status: "active" as const,
    last_visit_at: null
  };
  const card: AdminMemberCardResponse = {
    card_id: "card-001",
    public_id: "pub_owner001",
    display_name: "Owner Name",
    title: "Sales Lead",
    company: "Pilot Corp",
    avatar_url: null,
    fields: {
      mobile: null,
      phone: null,
      email: "configured@example.com",
      wechat_id: null,
      address: null
    },
    privacy: {
      show_mobile: false,
      show_email: true,
      show_wechat: false,
      allow_forward: true,
      show_avatar: true,
      share_title: null
    },
    status: "disabled"
  };

  let currentCard: AdminMemberCardResponse = { ...card };

  return {
    getOverview: async () => overview,
    listMembers: async (_session: AdminSession, query: AdminMemberListQuery) => {
      const items = [memberItem].filter((item) => {
        const matchesSearch =
          !query.search ||
          [item.display_name, item.open_userid, item.public_id].some((value) =>
            value?.toLowerCase().includes(query.search!.toLowerCase())
          );
        const matchesStatus = query.status === "all" || item.status === query.status;
        return matchesSearch && matchesStatus;
      });
      return {
        items: items.slice(query.offset, query.offset + query.limit),
        total: items.length
      };
    },
    listSyncEvents: async () => null,
    getMemberCard: async (_session: AdminSession, memberIdentityId: string) =>
      memberIdentityId === "member-001" ? currentCard : null,
    updateMemberCard: async (
      _session: AdminSession,
      memberIdentityId: string,
      request: UpdateAdminMemberCardRequest
    ) => {
      if (memberIdentityId !== "member-001") {
        return null;
      }
      currentCard = {
        ...currentCard,
        display_name: request.display_name ?? currentCard.display_name,
        title: request.title === undefined ? currentCard.title : request.title,
        fields: { ...currentCard.fields, ...(request.fields ?? {}) } as AdminMemberCardResponse["fields"],
        status: (request.status ?? currentCard.status) as AdminMemberCardResponse["status"]
      };
      return currentCard;
    },
    updateMemberStatus: async (_session: AdminSession, memberIdentityId: string, status: "active" | "disabled") => {
      if (memberIdentityId !== "member-001") {
        return false;
      }
      currentCard = { ...currentCard, status: status as AdminMemberCardResponse["status"] };
      return true;
    }
  } as unknown as AdminManagementRepository;
}

function fakeContactSync(): WecomContactSyncService {
  return {
    syncTenantMembers: async (input: SyncTenantContactMembersInput) => ({
      tenantId: input.tenantId,
      syncedCount: 2,
      skippedCount: 0,
      disabledCount: 0,
      detailSyncedCount: 2,
      detailMissingCount: 0,
      source: "contact_api" as const
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

function fakeAuthorization() {
  return {
    retryCalls: 0,
    lastRetry: null as { tenantId?: string } | null,
    async retryFailedContactSyncs(input?: { tenantId?: string }) {
      this.retryCalls += 1;
      this.lastRetry = input ?? null;
      return {
        retriedCount: 1,
        succeededCount: 1,
        failedCount: 0,
        deadCount: 0
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
