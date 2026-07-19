import { Injectable, ServiceUnavailableException } from "@nestjs/common";
import { WecomApiClientService, type WecomContactUserIdentity } from "./wecom-api-client.service.js";
import { WecomContactSyncRepository } from "./wecom-contact-sync.repository.js";
import { WecomCorpTokenService } from "./wecom-corp-token.service.js";
import { WecomTenantAuthRepository } from "./wecom-tenant-auth.repository.js";
import { WecomTenantSettingsRepository } from "./wecom-tenant-settings.repository.js";

export interface SyncTenantContactMembersInput {
  tenantId: string;
  tenantName: string;
}

export interface SyncTenantContactMembersResult {
  tenantId: string;
  syncedCount: number;
  skippedCount: number;
  disabledCount: number;
  detailSyncedCount: number;
  detailMissingCount: number;
}

@Injectable()
export class WecomContactSyncService {
  constructor(
    private readonly tenants: WecomTenantAuthRepository,
    private readonly corpTokens: WecomCorpTokenService,
    private readonly api: WecomApiClientService,
    private readonly repository: WecomContactSyncRepository,
    private readonly settings: WecomTenantSettingsRepository
  ) {}

  async syncTenantMembers(input: SyncTenantContactMembersInput): Promise<SyncTenantContactMembersResult> {
    const authorization = await this.tenants.getByTenantId(input.tenantId);
    if (!authorization) {
      throw new ServiceUnavailableException("WeCom tenant authorization is not available");
    }

    const corpToken = await this.corpTokens.getCorpAccessToken(authorization.openCorpid);
    const settings = await this.settings.get(input.tenantId);
    const users = await this.fetchAllContactUsers(corpToken.accessToken);
    const result = await this.repository.upsertMembers({
      tenantId: input.tenantId,
      tenantName: input.tenantName,
      createCards: settings.auto_create_cards,
      users: users.map((user) => ({
        userid: user.userid,
        openUserid: user.openUserid,
        name: user.name,
        departmentIds: user.departmentIds,
        title: user.title ?? null,
        mobile: user.mobile ?? null,
        email: user.email ?? null,
        status: "active"
      }))
    });

    const disabledCount = settings.auto_disable_left_members
      ? await this.repository.disableStaleMembers({
          tenantId: input.tenantId,
          activeOpenUserids: users.map((user) => user.openUserid).filter(Boolean) as string[],
          activeUserids: users.map((user) => user.userid).filter(Boolean) as string[]
        })
      : 0;

    return {
      tenantId: input.tenantId,
      syncedCount: result.syncedCount,
      skippedCount: result.skippedCount,
      disabledCount,
      detailSyncedCount: users.filter(hasUsefulContactDetail).length,
      detailMissingCount: users.filter((user) => !hasUsefulContactDetail(user)).length
    };
  }

  private async fetchAllContactUsers(accessToken: string): Promise<WecomContactUserIdentity[]> {
    const users = await this.fetchVisibleDepartmentUsers(accessToken);
    const seen = new Set<string>();
    const visibleUsers = users.filter((user) => {
      const key = user.openUserid || user.userid;
      if (!key) return false;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    const enriched: WecomContactUserIdentity[] = [];
    for (const user of visibleUsers) {
      if (!user.userid) {
        enriched.push(user);
        continue;
      }
      const detail = await this.fetchOptionalContactUserDetail(accessToken, user);
      enriched.push({
        userid: detail.userid ?? user.userid,
        openUserid: detail.openUserid ?? user.openUserid,
        name: detail.name ?? user.name,
        departmentIds: detail.departmentIds.length ? detail.departmentIds : user.departmentIds,
        title: detail.title ?? user.title ?? null,
        mobile: detail.mobile ?? user.mobile ?? null,
        email: detail.email ?? user.email ?? null
      });
    }
    return enriched;
  }

  private async fetchVisibleDepartmentUsers(accessToken: string): Promise<WecomContactUserIdentity[]> {
    return this.api.fetchDepartmentUsers({
      accessToken,
      departmentId: 1,
      fetchChild: true
    });
  }

  private async fetchOptionalContactUserDetail(
    accessToken: string,
    user: WecomContactUserIdentity
  ): Promise<WecomContactUserIdentity> {
    if (!user.userid) {
      return user;
    }
    try {
      return await this.api.fetchContactUserDetail({
        accessToken,
        userid: user.userid
      });
    } catch (error) {
      if (isForbiddenError(error)) {
        return user;
      }
      throw error;
    }
  }

}

function isForbiddenError(error: unknown): boolean {
  return Boolean(
    error &&
      typeof error === "object" &&
      "getStatus" in error &&
      typeof (error as { getStatus?: unknown }).getStatus === "function" &&
      (error as { getStatus: () => number }).getStatus() === 403
  );
}

function hasUsefulContactDetail(user: WecomContactUserIdentity): boolean {
  return Boolean(realContactName(user) || user.title || user.mobile || user.email);
}

function realContactName(user: WecomContactUserIdentity): string | null {
  const name = user.name?.trim();
  if (!name || name === user.userid?.trim() || name === user.openUserid?.trim()) {
    return null;
  }
  return name;
}
