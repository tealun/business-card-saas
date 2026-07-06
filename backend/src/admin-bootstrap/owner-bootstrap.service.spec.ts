import { ConflictException } from "@nestjs/common";
import { OwnerBootstrapRepository } from "./owner-bootstrap.repository.js";
import { OwnerBootstrapService } from "./owner-bootstrap.service.js";

describe("OwnerBootstrapService", () => {
  it("creates the first tenant owner when open_userid is available", () => {
    const repository = new OwnerBootstrapRepository();
    const service = new OwnerBootstrapService(repository);

    const result = service.bootstrapOwner({
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

  it("creates a short-lived claim token when open_userid is unavailable", () => {
    const repository = new OwnerBootstrapRepository();
    const service = new OwnerBootstrapService(repository);

    const result = service.bootstrapOwner({ tenant_id: "2" });

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

  it("rejects creating a second owner for the same tenant", () => {
    const repository = new OwnerBootstrapRepository();
    const service = new OwnerBootstrapService(repository);

    service.bootstrapOwner({
      tenant_id: "3",
      open_userid: "ou_first"
    });

    expect(() =>
      service.bootstrapOwner({
        tenant_id: "3",
        open_userid: "ou_second"
      })
    ).toThrow(ConflictException);
  });
});
