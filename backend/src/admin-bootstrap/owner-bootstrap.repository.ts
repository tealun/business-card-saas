import { ConflictException, Injectable } from "@nestjs/common";

export interface TenantAdminRecord {
  tenantId: string;
  memberIdentityId: string | null;
  openUserid: string;
  role: "owner";
}

export interface AdminClaimTokenRecord {
  tenantId: string;
  tokenHash: string;
  expiresAt: Date;
  usedAt: Date | null;
}

@Injectable()
export class OwnerBootstrapRepository {
  private readonly tenantAdmins = new Map<string, TenantAdminRecord>();
  private readonly claimTokens = new Map<string, AdminClaimTokenRecord>();

  hasOwner(tenantId: string): boolean {
    return Array.from(this.tenantAdmins.values()).some(
      (admin) => admin.tenantId === tenantId && admin.role === "owner"
    );
  }

  createOwner(input: { tenantId: string; memberIdentityId?: string; openUserid: string }): TenantAdminRecord {
    if (this.hasOwner(input.tenantId)) {
      throw new ConflictException("tenant owner already exists");
    }
    const key = `${input.tenantId}:${input.openUserid}`;
    if (this.tenantAdmins.has(key)) {
      throw new ConflictException("tenant admin already exists");
    }
    const record: TenantAdminRecord = {
      tenantId: input.tenantId,
      memberIdentityId: input.memberIdentityId ?? null,
      openUserid: input.openUserid,
      role: "owner"
    };
    this.tenantAdmins.set(key, record);
    return record;
  }

  createClaimToken(input: { tenantId: string; tokenHash: string; expiresAt: Date }): AdminClaimTokenRecord {
    if (this.hasOwner(input.tenantId)) {
      throw new ConflictException("tenant owner already exists");
    }
    if (this.claimTokens.has(input.tokenHash)) {
      throw new ConflictException("admin claim token already exists");
    }
    const record: AdminClaimTokenRecord = {
      tenantId: input.tenantId,
      tokenHash: input.tokenHash,
      expiresAt: input.expiresAt,
      usedAt: null
    };
    this.claimTokens.set(input.tokenHash, record);
    return record;
  }

  findClaimToken(tokenHash: string): AdminClaimTokenRecord | undefined {
    return this.claimTokens.get(tokenHash);
  }
}
