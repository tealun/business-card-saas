import { Injectable, ServiceUnavailableException } from "@nestjs/common";
import { WecomApiClientService, type WecomContactUserIdentity } from "./wecom-api-client.service.js";
import { WecomContactSyncRepository } from "./wecom-contact-sync.repository.js";
import { WecomCorpTokenService } from "./wecom-corp-token.service.js";
import { WecomTenantAuthRepository } from "./wecom-tenant-auth.repository.js";

export interface SyncTenantContactMembersInput {
  tenantId: string;
  tenantName: string;
}

export interface SyncTenantContactMembersResult {
  tenantId: string;
  syncedCount: number;
  skippedCount: number;
  disabledCount: number;
}

const contactPageLimit = 1000;
const maxContactPages = 20;

@Injectable()
export class WecomContactSyncService {
  constructor(
    private readonly tenants: WecomTenantAuthRepository,
    private readonly corpTokens: WecomCorpTokenService,
    private readonly api: WecomApiClientService,
    private readonly repository: WecomContactSyncRepository
  ) {}

  async syncTenantMembers(input: SyncTenantContactMembersInput): Promise<SyncTenantContactMembersResult> {
    const authorization = await this.tenants.getByTenantId(input.tenantId);
    if (!authorization) {
      throw new ServiceUnavailableException("WeCom tenant authorization is not available");
    }

    const corpToken = await this.corpTokens.getCorpAccessToken(authorization.openCorpid);
    const users = await this.fetchAllContactUsers(corpToken.accessToken);
    const result = await this.repository.upsertMembers({
      tenantId: input.tenantId,
      tenantName: input.tenantName,
      users: users.map((user) => ({
        userid: user.userid,
        openUserid: user.openUserid,
        name: user.name,
        departmentIds: user.departmentIds,
        status: "active"
      }))
    });

    const disabledCount = await this.repository.disableStaleMembers({
      tenantId: input.tenantId,
      activeOpenUserids: users.map((user) => user.openUserid).filter(Boolean) as string[],
      activeUserids: users.map((user) => user.userid).filter(Boolean) as string[]
    });

    return {
      tenantId: input.tenantId,
      syncedCount: result.syncedCount,
      skippedCount: result.skippedCount,
      disabledCount
    };
  }

  private async fetchAllContactUsers(accessToken: string): Promise<WecomContactUserIdentity[]> {
    const users: WecomContactUserIdentity[] = [];
    let cursor: string | null = "";
    for (let page = 0; page < maxContactPages; page += 1) {
      const response = await this.api.fetchContactUserIds({
        accessToken,
        cursor,
        limit: contactPageLimit
      });
      users.push(...response.users);
      if (!response.nextCursor) {
        return users;
      }
      cursor = response.nextCursor;
    }
    throw new ServiceUnavailableException("WeCom contact sync exceeded the page safety limit");
  }
}
