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

  async bootstrapOwner(input: BootstrapOwnerInput): Promise<BootstrapOwnerResult> {
    if (input.open_userid) {
      const ownerInput: { tenantId: string; memberIdentityId?: string; openUserid: string } = {
        tenantId: input.tenant_id,
        openUserid: input.open_userid
      };
      if (input.member_identity_id) {
        ownerInput.memberIdentityId = input.member_identity_id;
      }
      const owner = await this.repository.createOwner(ownerInput);
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
    const record = await this.repository.createClaimToken({
      tenantId: input.tenant_id,
      tokenHash,
      expiresAt
    });
    return bootstrapOwnerResultSchema.parse({
      mode: "claim_token_created",
      tenant_id: record.tenantId,
      claim_token: claimToken,
      expires_at: record.expiresAt.toISOString()
    });
  }

  hashClaimToken(token: string): string {
    return createHash("sha256").update(token).digest("hex");
  }

  async claimOwner(input: {
    tenant_id: string;
    claim_token: string;
    member_identity_id?: string | null;
    open_userid: string;
  }) {
    const ownerInput: { tenantId: string; tokenHash: string; memberIdentityId?: string; openUserid: string } = {
      tenantId: input.tenant_id,
      tokenHash: this.hashClaimToken(input.claim_token),
      openUserid: input.open_userid
    };
    if (input.member_identity_id) {
      ownerInput.memberIdentityId = input.member_identity_id;
    }
    return this.repository.claimOwner(ownerInput);
  }
}
