import { ConflictException } from "@nestjs/common";
import { OwnerBootstrapRepository } from "./owner-bootstrap.repository.js";
import { OwnerBootstrapService } from "./owner-bootstrap.service.js";

describe("OwnerBootstrapService", () => {
  it("creates the first tenant owner when open_userid is available", async () => {
    const repository = new OwnerBootstrapRepository();
    const service = new OwnerBootstrapService(repository);

    const result = await service.bootstrapOwner({
      tenant_id: "1",
      member_identity_id: "10",
      open_userid: "ou_owner"
    });

    expect(result).toEqual({
      mode: "owner_created",
      tenant_id: "1",
      role: "owner",
      open_userid: "ou_owner",
      member_identity_id: "10"
    });
  });

  it("creates a short-lived claim token when open_userid is unavailable", async () => {
    const repository = new OwnerBootstrapRepository();
    const service = new OwnerBootstrapService(repository);

    const result = await service.bootstrapOwner({ tenant_id: "2" });

    expect(result.mode).toBe("claim_token_created");
    if (result.mode !== "claim_token_created") {
      throw new Error("expected claim token result");
    }
    expect(result.claim_token).toMatch(/^admclaim_/);
    const tokenHash = service.hashClaimToken(result.claim_token);
    expect(repository.findClaimToken(tokenHash)?.usedAt).toBeNull();
    expect(result).not.toHaveProperty("token_hash");
    expect(new Date(result.expires_at).getTime()).toBeGreaterThan(Date.now());
  });

  it("claims owner with a short-lived token and marks the token used", async () => {
    const repository = new OwnerBootstrapRepository();
    const service = new OwnerBootstrapService(repository);

    const created = await service.bootstrapOwner({ tenant_id: "2" });
    if (created.mode !== "claim_token_created") {
      throw new Error("expected claim token result");
    }

    const owner = await service.claimOwner({
      tenant_id: "2",
      claim_token: created.claim_token,
      member_identity_id: "20",
      open_userid: "ou_claimed"
    });

    expect(owner).toEqual({
      tenantId: "2",
      role: "owner",
      openUserid: "ou_claimed",
      memberIdentityId: "20"
    });
    expect(repository.findClaimToken(service.hashClaimToken(created.claim_token))?.usedAt).toBeInstanceOf(Date);
  });

  it("rejects creating a second owner for the same tenant", async () => {
    const repository = new OwnerBootstrapRepository();
    const service = new OwnerBootstrapService(repository);

    await service.bootstrapOwner({
      tenant_id: "3",
      open_userid: "ou_first"
    });

    await expect(
      service.bootstrapOwner({
        tenant_id: "3",
        open_userid: "ou_second"
      })
    ).rejects.toThrow(ConflictException);
  });
});
