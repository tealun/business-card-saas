import { ForbiddenException, NotFoundException } from "@nestjs/common";
import { EmployeeCardRepository } from "../employee/employee-card.repository.js";
import { EmployeeCardService } from "../employee/employee-card.service.js";
import { PublicCardRepository } from "../public-card/public-card.repository.js";
import type { AdminSession } from "../admin-auth/admin-session.js";
import { AdminManagementService } from "./admin-management.service.js";

describe("AdminManagementService", () => {
  it("returns overview and current tenant member summary", () => {
    const service = createService();
    const overview = service.getOverview(ownerSession());
    const members = service.listMembers(ownerSession());

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

  it("updates a member card when the admin has operator or higher permission", () => {
    const service = createService();

    const card = service.updateMemberCard(ownerSession(), "member-001", {
      display_name: "Configured Name",
      title: "Sales Lead",
      fields: { email: "configured@example.com" }
    });

    expect(card.display_name).toBe("Configured Name");
    expect(card.title).toBe("Sales Lead");
    expect(card.fields.email).toBe("configured@example.com");
    expect(service.getMemberCard(ownerSession(), "member-001").display_name).toBe("Configured Name");
  });

  it("rejects write attempts from read-only auditors", () => {
    const service = createService();

    expect(() =>
      service.updateMemberCard({ ...ownerSession(), role: "auditor" }, "member-001", {
        display_name: "Nope"
      })
    ).toThrow(ForbiddenException);
  });

  it("rejects cross-member access in the current MVP repository", () => {
    const service = createService();

    expect(() => service.getMemberCard(ownerSession(), "member-other")).toThrow(NotFoundException);
  });
});

function createService() {
  return new AdminManagementService(
    new EmployeeCardService(new EmployeeCardRepository(), new PublicCardRepository())
  );
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
