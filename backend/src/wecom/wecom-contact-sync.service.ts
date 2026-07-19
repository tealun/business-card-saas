import { Injectable, ServiceUnavailableException } from "@nestjs/common";
import { WecomApiClientService, type WecomContactUserIdentity } from "./wecom-api-client.service.js";
import { WecomContactSyncRepository } from "./wecom-contact-sync.repository.js";
import { WecomCorpTokenService } from "./wecom-corp-token.service.js";
import { WecomSuiteTokenService } from "./wecom-suite-token.service.js";
import { WecomTenantAuthRepository, type TenantAuthorizationSnapshot } from "./wecom-tenant-auth.repository.js";
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
    private readonly settings: WecomTenantSettingsRepository,
    private readonly suiteTokens: WecomSuiteTokenService
  ) {}

  async syncTenantMembers(input: SyncTenantContactMembersInput): Promise<SyncTenantContactMembersResult> {
    const authorization = await this.tenants.getByTenantId(input.tenantId);
    if (!authorization) {
      throw new ServiceUnavailableException("WeCom tenant authorization is not available");
    }

    const corpToken = await this.corpTokens.getCorpAccessToken(authorization.openCorpid);
    const settings = await this.settings.get(input.tenantId);
    const users = await this.fetchAllContactUsers(corpToken.accessToken, authorization);
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

  // 企业微信不向第三方应用返回成员真实姓名/手机号（user/get 以 userid 代替 name），
  // 所以这里不做逐人详情补全；真实资料由成员在小程序内完成敏感信息授权后写入。
  private async fetchAllContactUsers(
    accessToken: string,
    authorization: TenantAuthorizationSnapshot
  ): Promise<WecomContactUserIdentity[]> {
    const users = await this.fetchVisibleUsers(accessToken, authorization);
    const seen = new Set<string>();
    return users.filter((user) => {
      const key = user.openUserid || user.userid;
      if (!key) return false;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  private async fetchVisibleUsers(
    accessToken: string,
    authorization: TenantAuthorizationSnapshot
  ): Promise<WecomContactUserIdentity[]> {
    try {
      return await this.fetchVisibleDepartmentUsers(accessToken);
    } catch (error) {
      if (!isForbiddenError(error)) {
        throw error;
      }
      // 通讯录接口无权限时降级：授权信息里的可见范围（privilege.allow_user）
      // 至少给出成员账号列表；按部门授权（allow_party）时该列表为空，此时仍抛原错误。
      const fallbackUsers = await this.fetchAuthorizedScopeUsers(authorization);
      if (!fallbackUsers.length) {
        throw error;
      }
      return fallbackUsers;
    }
  }

  private async fetchVisibleDepartmentUsers(accessToken: string): Promise<WecomContactUserIdentity[]> {
    const departmentIds = await this.api.fetchVisibleDepartmentIds({ accessToken });
    const users: WecomContactUserIdentity[] = [];
    for (const departmentId of departmentIds) {
      users.push(...(await this.api.fetchDepartmentUsers({ accessToken, departmentId })));
    }
    return users;
  }

  private async fetchAuthorizedScopeUsers(
    authorization: TenantAuthorizationSnapshot
  ): Promise<WecomContactUserIdentity[]> {
    const suiteToken = await this.suiteTokens.getSuiteAccessToken();
    const info = await this.api.fetchAuthorizationInfo({
      suiteAccessToken: suiteToken.accessToken,
      openCorpid: authorization.openCorpid,
      permanentCode: authorization.permanentCode
    });
    return usersFromAuthInfo(info.authInfo);
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

function usersFromAuthInfo(authInfo: unknown): WecomContactUserIdentity[] {
  const agents =
    (authInfo as { agent?: Array<{ privilege?: { allow_user?: unknown[] } }> } | null)?.agent ?? [];
  const users: WecomContactUserIdentity[] = [];
  const seen = new Set<string>();
  for (const agent of agents) {
    for (const raw of agent?.privilege?.allow_user ?? []) {
      const id = String(raw ?? "").trim();
      if (!id || seen.has(id)) {
        continue;
      }
      seen.add(id);
      users.push({ userid: null, openUserid: id, name: null, departmentIds: [] });
    }
  }
  return users;
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
