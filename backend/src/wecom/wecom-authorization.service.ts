import { createHash } from "node:crypto";
import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import { WecomApiClientService } from "./wecom-api-client.service.js";
import { WecomContactSyncService } from "./wecom-contact-sync.service.js";
import { WecomSuiteTokenService } from "./wecom-suite-token.service.js";
import { TenantAuthorizationSnapshot, WecomTenantAuthRepository } from "./wecom-tenant-auth.repository.js";

@Injectable()
export class WecomAuthorizationService {
  private readonly logger = new Logger(WecomAuthorizationService.name);
  private readonly authCodeOperations = new Map<string, Promise<TenantAuthorizationSnapshot>>();
  constructor(
    private readonly suiteTokens: WecomSuiteTokenService,
    private readonly api: WecomApiClientService,
    private readonly tenants: WecomTenantAuthRepository,
    private readonly contactSync: WecomContactSyncService
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

  private async syncAuthorizedTenant(
    authorization: TenantAuthorizationSnapshot,
    source: "create_auth" | "change_auth"
  ): Promise<void> {
    try {
      await this.contactSync.syncTenantMembers({
        tenantId: authorization.tenantId,
        tenantName: authorization.corpName
      });
    } catch (error) {
      this.logger.warn(
        `WeCom contact sync failed after ${source} for tenant ${authorization.tenantId}: ${errorMessage(error)}`
      );
    }
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
