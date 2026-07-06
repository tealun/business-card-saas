import { EmployeeCardRepository } from "./employee-card.repository.js";

describe("EmployeeCardRepository", () => {
  it("aligns card status with the current employee session", () => {
    const repository = new EmployeeCardRepository();

    const card = repository.getCurrentCard({
      accountId: "acct-001",
      tenantId: "tenant-001",
      tenantName: "Pilot Corp",
      memberIdentityId: "member-001",
      displayName: "Ada",
      openUserid: "ou-001",
      publicId: "pub_001",
      status: "disabled"
    });
    const preview = repository.getPreview({
      accountId: "acct-001",
      tenantId: "tenant-001",
      tenantName: "Pilot Corp",
      memberIdentityId: "member-001",
      displayName: "Ada",
      openUserid: "ou-001",
      publicId: "pub_001",
      status: "disabled"
    });

    expect(card.status).toBe("disabled");
    expect(preview.status).toBe("disabled");
  });
});
