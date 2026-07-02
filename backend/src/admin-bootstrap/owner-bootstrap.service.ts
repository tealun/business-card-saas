import { Injectable } from "@nestjs/common";
import { createHash } from "node:crypto";
import {
  bootstrapOwnerResultSchema,
  type BootstrapOwnerInput,
  type BootstrapOwnerResult
} from "../contracts/admin-bootstrap.js";
import { randomToken } from "../common/id.js";
import { OwnerBootstrapRepository } from "./owner-bootstrap.repository.js";

@Injectable()
export class OwnerBootstrapService {
  private readonly claimTokenTtlMs = 15 * 60 * 1000;

  constructor(private readonly repository: OwnerBootstrapRepository) {}

  bootstrapOwner(input: BootstrapOwnerInput): BootstrapOwnerResult {
    if (input.open_userid) {
      const ownerInput: { tenantId: string; memberIdentityId?: string; openUserid: string } = {
        tenantId: input.tenant_id,
        openUserid: input.open_userid
      };
      if (input.member_identity_id) {
        ownerInput.memberIdentityId = input.member_identity_id;
      }
      const owner = this.repository.createOwner(ownerInput);
      return bootstrapOwnerResultSchema.parse({
        mode: "owner_created",
        tenant_id: owner.tenantId,
        role: owner.role,
        open_userid: owner.openUserid,
        member_identity_id: owner.memberIdentityId
      });
    }

    const claimToken = randomToken("admclaim", 24);
    const tokenHash = this.hashClaimToken(claimToken);
    const expiresAt = new Date(Date.now() + this.claimTokenTtlMs);
    const record = this.repository.createClaimToken({
      tenantId: input.tenant_id,
      tokenHash,
      expiresAt
    });
    return bootstrapOwnerResultSchema.parse({
      mode: "claim_token_created",
      tenant_id: record.tenantId,
      claim_token: claimToken,
      token_hash: record.tokenHash,
      expires_at: record.expiresAt.toISOString()
    });
  }

  hashClaimToken(token: string): string {
    return createHash("sha256").update(token).digest("hex");
  }
}
