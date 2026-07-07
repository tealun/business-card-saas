import { CanActivate, ForbiddenException, NotFoundException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import type { AdminSession } from "../admin-auth/admin-session.js";
import { AdminManagementController } from "./admin-management.controller.js";
import { AdminManagementService } from "./admin-management.service.js";

const adminSession: AdminSession = {
  tenantId: "tenant-001",
  tenantName: "Pilot Corp",
  memberIdentityId: "member-001",
  openUserid: "ou-owner",
  role: "owner"
};

class FakeAuthGuard implements CanActivate {
  canActivate() {
    return true;
  }
}

describe("AdminManagementController", () => {
  async function createController(serviceOverrides: Partial<AdminManagementService> = {}) {
    const moduleRef = await Test.createTestingModule({
      controllers: [AdminManagementController],
      providers: [
        {
          provide: AdminManagementService,
          useValue: {
            getOverview: async () => ({
              tenant_id: adminSession.tenantId,
              tenant_name: adminSession.tenantName,
              member_count: 1,
              card_count: 1,
              active_card_count: 1
            }),
            listMembers: async () => ({ items: [], total: 0 }),
            syncMembers: async () => ({
              tenant_id: adminSession.tenantId,
              synced_count: 2,
              skipped_count: 0,
              disabled_count: 0
            }),
            listSyncEvents: async () => ({ items: [], total: 0 }),
            retryFailedSyncEvents: async () => ({
              retried_count: 0,
              succeeded_count: 0,
              failed_count: 0,
              dead_count: 0
            }),
            getMemberCard: async () => {
              throw new NotFoundException("not found");
            },
            updateMemberCard: async () => {
              throw new NotFoundException("not found");
            },
            ...serviceOverrides
          }
        }
      ]
    })
      .overrideGuard((await import("../admin-auth/admin-auth.guard.js")).AdminAuthGuard)
      .useClass(FakeAuthGuard)
      .compile();

    const controller = moduleRef.get(AdminManagementController);
    return { controller, moduleRef };
  }

  it("returns overview", async () => {
    const { controller } = await createController();
    const request = { adminSession };
    await expect(controller.overview(request as never)).resolves.toEqual({
      tenant_id: "tenant-001",
      tenant_name: "Pilot Corp",
      member_count: 1,
      card_count: 1,
      active_card_count: 1
    });
  });

  it("lists members with parsed query", async () => {
    const { controller } = await createController();
    const request = { adminSession };
    await expect(controller.members(request as never, { search: "owner", status: "all", limit: "10", offset: "0" })).resolves.toEqual({
      items: [],
      total: 0
    });
  });

  it("syncs members", async () => {
    const { controller } = await createController();
    const request = { adminSession };
    await expect(controller.syncMembers(request as never)).resolves.toEqual({
      tenant_id: "tenant-001",
      synced_count: 2,
      skipped_count: 0,
      disabled_count: 0
    });
  });

  it("rejects sync when the service throws ForbiddenException", async () => {
    const { controller } = await createController({
      syncMembers: async () => {
        throw new ForbiddenException("not allowed");
      }
    });
    const request = { adminSession };
    await expect(controller.syncMembers(request as never)).rejects.toThrow(ForbiddenException);
  });
});
