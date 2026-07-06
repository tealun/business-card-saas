import { Injectable, ServiceUnavailableException } from "@nestjs/common";
import { WecomApiClientService } from "./wecom-api-client.service.js";
import { WecomConfigService } from "./wecom-config.service.js";
import { WecomSuiteStateRepository, type WecomSuiteAccessTokenSnapshot } from "./wecom-suite-state.repository.js";

export interface WecomSuiteAccessTokenResult extends WecomSuiteAccessTokenSnapshot {
  fromCache: boolean;
}

const refreshSkewMs = 5 * 60 * 1000;

@Injectable()
export class WecomSuiteTokenService {
  private readonly inflight = new Map<string, Promise<WecomSuiteAccessTokenSnapshot>>();

  constructor(
    private readonly config: WecomConfigService,
    private readonly api: WecomApiClientService,
    private readonly suiteState: WecomSuiteStateRepository
  ) {}

  async getSuiteAccessToken(now = new Date()): Promise<WecomSuiteAccessTokenResult> {
    const suite = this.config.suite;
    const cached = await this.suiteState.getSuiteAccessToken(suite.suiteId);
    if (cached && this.isFresh(cached, now)) {
      return { ...cached, fromCache: true };
    }

    const currentInflight = this.inflight.get(suite.suiteId);
    if (currentInflight) {
      return { ...(await currentInflight), fromCache: false };
    }

    const refresh = this.refreshSuiteAccessToken(now).finally(() => {
      this.inflight.delete(suite.suiteId);
    });
    this.inflight.set(suite.suiteId, refresh);
    return { ...(await refresh), fromCache: false };
  }

  private async refreshSuiteAccessToken(now: Date): Promise<WecomSuiteAccessTokenSnapshot> {
    const suite = this.config.suite;
    const ticket = await this.suiteState.getSuiteTicket(suite.suiteId);
    if (!ticket) {
      throw new ServiceUnavailableException("WeCom suite_ticket is not available");
    }

    const response = await this.api.fetchSuiteAccessToken({
      suiteId: suite.suiteId,
      suiteSecret: suite.suiteSecret,
      suiteTicket: ticket.suiteTicket
    });
    const expiresAt = new Date(now.getTime() + response.expiresIn * 1000);
    return this.suiteState.saveSuiteAccessToken(suite.suiteId, response.suiteAccessToken, expiresAt);
  }

  private isFresh(token: WecomSuiteAccessTokenSnapshot, now: Date): boolean {
    return token.expiresAt.getTime() - now.getTime() > refreshSkewMs;
  }
}
