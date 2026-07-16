import { createHash } from "node:crypto";
import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import { WecomApiClientService } from "./wecom-api-client.service.js";
import { WecomCallbackEventRepository } from "./wecom-callback-event.repository.js";
import { WecomContactSyncService } from "./wecom-contact-sync.service.js";
import { WecomSuiteTokenService } from "./wecom-suite-token.service.js";
import { TenantAuthorizationSnapshot, WecomTenantAuthRepository } from "./wecom-tenant-auth.repository.js";
import { WecomTenantSettingsRepository } from "./wecom-tenant-settings.repository.js";

export interface WecomAuthorizationSyncRetryResult {
  retriedCount: number;
  succeededCount: number;
  failedCount: number;
  deadCount: number;
}

const MAX_AUTH_SYNC_RETRIES = 5;

@Injectable()
export class WecomAuthorizationService {
  private readonly logger = new Logger(WecomAuthorizationService.name);
  private readonly authCodeOperations = new Map<string, Promise<TenantAuthorizationSnapshot>>();
  constructor(
    private readonly suiteTokens: WecomSuiteTokenService,
    private readonly api: WecomApiClientService,
    private readonly tenants: WecomTenantAuthRepository,
    private readonly contactSync: WecomContactSyncService,
    private readonly events: WecomCallbackEventRepository,
    private readonly settings: WecomTenantSettingsRepository
  ) {}

  async handleAuthCode(authCode: string, authorizedAt = new Date()): Promise<TenantAuthorizationSnapshot> {
    const normalizedCode = authCode.trim();
    if (!normalizedCode) {
      throw new BadRequestException("WeCom auth_code is required");
    }

    const operationKey = createHash("sha256").update(normalizedCode).digest("hex");
    const current = this.authCodeOperations.get(operationKey);
    if (current) {
      return current;
    }
    const operation = this.exchangeAuthCode(normalizedCode, authorizedAt);
    this.authCodeOperations.set(operationKey, operation);
    try {
      const result = await operation;
      setTimeout(() => this.authCodeOperations.delete(operationKey), 10 * 60 * 1000).unref();
      return result;
    } catch (error) {
      this.authCodeOperations.delete(operationKey);
      throw error;
    }
  }

  private async exchangeAuthCode(authCode: string, authorizedAt: Date): Promise<TenantAuthorizationSnapshot> {
    const suiteToken = await this.suiteTokens.getSuiteAccessToken();
    const authorization = await this.api.fetchPermanentCode({
      suiteAccessToken: suiteToken.accessToken,
      authCode
    });
    const saved = await this.tenants.saveAuthorization({
      openCorpid: authorization.openCorpid,
      corpName: authorization.corpName,
      permanentCode: authorization.permanentCode,
      agentId: authorization.agentId,
      authInfo: authorization.authInfo,
      authorizedAt
    });
    await this.syncAuthorizedTenant(saved, "create_auth");
    return saved;
  }

  async refreshAuthorization(openCorpid: string, changedAt = new Date()): Promise<TenantAuthorizationSnapshot> {
    const normalizedCorpid = openCorpid.trim();
    if (!normalizedCorpid) {
      throw new BadRequestException("WeCom auth corp id is required");
    }
    const current = await this.tenants.getByOpenCorpid(normalizedCorpid);
    if (!current) {
      throw new BadRequestException("WeCom tenant authorization was not found");
    }
    const suiteToken = await this.suiteTokens.getSuiteAccessToken();
    const authorization = await this.api.fetchAuthorizationInfo({
      suiteAccessToken: suiteToken.accessToken,
      openCorpid: current.openCorpid,
      permanentCode: current.permanentCode
    });
    const saved = await this.tenants.saveAuthorization({
      openCorpid: authorization.openCorpid,
      corpName: authorization.corpName,
      permanentCode: current.permanentCode,
      agentId: authorization.agentId,
      authInfo: authorization.authInfo,
      authorizedAt: changedAt
    });
    await this.syncAuthorizedTenant(saved, "change_auth");
    return saved;
  }

  async cancelAuthorization(openCorpid: string, cancelledAt = new Date()): Promise<boolean> {
    const normalizedCorpid = openCorpid.trim();
    if (!normalizedCorpid) {
      throw new BadRequestException("WeCom auth corp id is required");
    }
    return this.tenants.cancelAuthorization(normalizedCorpid, cancelledAt);
  }

  async retryFailedContactSyncs(input: { tenantId?: string; limit?: number } = {}): Promise<WecomAuthorizationSyncRetryResult> {
    const candidates = await this.events.listRetryableSyncEvents(
      MAX_AUTH_SYNC_RETRIES,
      input.limit ?? 20,
      input.tenantId ?? null
    );
    const result: WecomAuthorizationSyncRetryResult = {
      retriedCount: 0,
      succeededCount: 0,
      failedCount: 0,
      deadCount: 0
    };

    for (const event of candidates) {
      result.retriedCount += 1;
      if (!event.tenantId) {
        result.failedCount += 1;
        continue;
      }
      const tenant = await this.tenants.getByTenantId(event.tenantId);
      if (!tenant) {
        result.failedCount += 1;
        await this.events.markFailed(event.eventKey, new Error("WeCom tenant authorization was not found"), event.tenantId, {
          deadLetter: true
        });
        result.deadCount += 1;
        continue;
      }

      try {
        await this.contactSync.syncTenantMembers({
          tenantId: tenant.tenantId,
          tenantName: tenant.corpName
        });
        await this.events.markDone(event.eventKey, tenant.tenantId);
        result.succeededCount += 1;
      } catch (error) {
        const deadLetter = event.retryCount + 1 >= MAX_AUTH_SYNC_RETRIES;
        await this.events.markFailed(event.eventKey, error, tenant.tenantId, { deadLetter });
        result.failedCount += 1;
        if (deadLetter) {
          result.deadCount += 1;
        }
      }
    }
    return result;
  }

  private async syncAuthorizedTenant(
    authorization: TenantAuthorizationSnapshot,
    source: "create_auth" | "change_auth"
  ): Promise<void> {
    try {
      const settings = await this.settings.get(authorization.tenantId);
      if (!settings.auto_sync_on_auth) {
        return;
      }
      await this.contactSync.syncTenantMembers({
        tenantId: authorization.tenantId,
        tenantName: authorization.corpName
      });
    } catch (error) {
      await this.events.recordTenantSyncFailure({
        eventKey: authorizationSyncEventKey(authorization.tenantId, source),
        tenantId: authorization.tenantId,
        eventType: "contact_sync",
        changeType: source,
        error
      });
      this.logger.warn(
        `WeCom contact sync failed after ${source} for tenant ${authorization.tenantId}: ${errorMessage(error)}`
      );
    }
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function authorizationSyncEventKey(tenantId: string, source: "create_auth" | "change_auth"): string {
  return `wecom:sync:${tenantId}:${source}`;
}
