import { Injectable, ServiceUnavailableException } from "@nestjs/common";
import { WecomApiClientService } from "./wecom-api-client.service.js";
import { WecomSuiteTokenService } from "./wecom-suite-token.service.js";
import { WecomCorpAccessTokenSnapshot, WecomTenantAuthRepository } from "./wecom-tenant-auth.repository.js";

export interface WecomCorpAccessTokenResult extends WecomCorpAccessTokenSnapshot {
  fromCache: boolean;
}

const refreshSkewMs = 5 * 60 * 1000;

@Injectable()
export class WecomCorpTokenService {
  private readonly inflight = new Map<string, Promise<WecomCorpAccessTokenSnapshot>>();

  constructor(
    private readonly suiteTokens: WecomSuiteTokenService,
    private readonly api: WecomApiClientService,
    private readonly tenants: WecomTenantAuthRepository
  ) {}

  async getCorpAccessToken(openCorpid: string, now = new Date()): Promise<WecomCorpAccessTokenResult> {
    const normalizedCorpid = openCorpid.trim();
    if (!normalizedCorpid) {
      throw new ServiceUnavailableException("WeCom tenant authorization is not available");
    }

    const cached = await this.tenants.getCorpAccessToken(normalizedCorpid);
    if (cached && this.isFresh(cached, now)) {
      return { ...cached, fromCache: true };
    }

    const currentInflight = this.inflight.get(normalizedCorpid);
    if (currentInflight) {
      return { ...(await currentInflight), fromCache: false };
    }

    const refresh = this.refreshCorpAccessToken(normalizedCorpid, now).finally(() => {
      this.inflight.delete(normalizedCorpid);
    });
    this.inflight.set(normalizedCorpid, refresh);
    return { ...(await refresh), fromCache: false };
  }

  private async refreshCorpAccessToken(openCorpid: string, now: Date): Promise<WecomCorpAccessTokenSnapshot> {
    const authorization = await this.tenants.getByOpenCorpid(openCorpid);
    if (!authorization) {
      throw new ServiceUnavailableException("WeCom tenant authorization is not available");
    }

    const suiteToken = await this.suiteTokens.getSuiteAccessToken(now);
    const response = await this.api.fetchCorpAccessToken({
      suiteAccessToken: suiteToken.accessToken,
      openCorpid,
      permanentCode: authorization.permanentCode
    });
    const expiresAt = new Date(now.getTime() + response.expiresIn * 1000);
    return this.tenants.saveCorpAccessToken(openCorpid, response.accessToken, expiresAt);
  }

  private isFresh(token: WecomCorpAccessTokenSnapshot, now: Date): boolean {
    return token.expiresAt.getTime() - now.getTime() > refreshSkewMs;
  }
}
