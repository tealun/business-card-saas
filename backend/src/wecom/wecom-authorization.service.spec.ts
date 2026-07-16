import { DatabaseService } from "../database/database.service.js";
import {
  WecomApiClientService,
  type FetchAuthorizationInfoRequest,
  type FetchAuthorizationInfoResponse,
  type FetchPermanentCodeRequest,
  type FetchPermanentCodeResponse
} from "./wecom-api-client.service.js";
import { WecomAuthorizationService } from "./wecom-authorization.service.js";
import { WecomCallbackEventRepository } from "./wecom-callback-event.repository.js";
import { WecomContactSyncService, type SyncTenantContactMembersInput } from "./wecom-contact-sync.service.js";
import { WecomStateCipherService } from "./wecom-state-cipher.service.js";
import { WecomSuiteTokenService, type WecomSuiteAccessTokenResult } from "./wecom-suite-token.service.js";
import { WecomTenantAuthRepository } from "./wecom-tenant-auth.repository.js";
import { WecomTenantSettingsRepository } from "./wecom-tenant-settings.repository.js";

describe("WecomAuthorizationService", () => {
  const originalDatabaseUrl = process.env.DATABASE_URL;

  beforeEach(() => {
    delete process.env.DATABASE_URL;
  });

  afterAll(() => {
    if (originalDatabaseUrl) {
      process.env.DATABASE_URL = originalDatabaseUrl;
    }
  });

  it("exchanges auth_code and upserts an active tenant authorization", async () => {
    const { service, api, tenants, contactSync } = createService();

    const saved = await service.handleAuthCode(" auth-code-001 ", new Date("2026-07-06T10:00:00.000Z"));

    expect(saved.openCorpid).toBe("corp-001");
    expect(saved.corpName).toBe("Pilot Corp");
    expect(saved.permanentCode).toBe("perm-001");
    expect(saved.agentId).toBe("100001");
    expect(api.lastRequest).toEqual({ suiteAccessToken: "suite-token", authCode: "auth-code-001" });

    const stored = await tenants.getByOpenCorpid("corp-001");
    expect(stored?.permanentCode).toBe("perm-001");
    expect(stored?.authStatus).toBe("active");
    expect(contactSync.requests).toEqual([{ tenantId: saved.tenantId, tenantName: "Pilot Corp" }]);
  });

  it("updates an existing tenant authorization for the same corp", async () => {
    const { service, api, tenants, contactSync } = createService();
    await service.handleAuthCode("auth-code-001");
    api.nextResponse = {
      openCorpid: "corp-001",
      corpName: "Pilot Corp Renamed",
      permanentCode: "perm-002",
      agentId: "100002",
      authInfo: { agent: [{ agentid: 100002 }] }
    };

    const updated = await service.handleAuthCode("auth-code-002");

    const stored = await tenants.getByOpenCorpid("corp-001");
    expect(updated.tenantId).toBe(stored?.tenantId);
    expect(stored?.corpName).toBe("Pilot Corp Renamed");
    expect(stored?.permanentCode).toBe("perm-002");
    expect(stored?.agentId).toBe("100002");
    expect(contactSync.requests.at(-1)).toEqual({ tenantId: updated.tenantId, tenantName: "Pilot Corp Renamed" });
  });

  it("refreshes changed authorization scope without exchanging a new auth code", async () => {
    const { service, api, tenants, contactSync } = createService();
    await service.handleAuthCode("auth-code-001");

    const refreshed = await service.refreshAuthorization(" corp-001 ", new Date("2026-07-07T10:00:00.000Z"));

    expect(api.lastAuthorizationInfoRequest).toEqual({
      suiteAccessToken: "suite-token",
      openCorpid: "corp-001",
      permanentCode: "perm-001"
    });
    expect(refreshed.permanentCode).toBe("perm-001");
    expect(refreshed.corpName).toBe("Pilot Corp Changed");
    expect(contactSync.requests.at(-1)).toEqual({ tenantId: refreshed.tenantId, tenantName: "Pilot Corp Changed" });
  });

  it("keeps authorization active when initial contact sync is temporarily unavailable", async () => {
    const { service, tenants, contactSync, events } = createService();
    contactSync.fail = true;

    const saved = await service.handleAuthCode("auth-code-001");

    await expect(tenants.getByOpenCorpid("corp-001")).resolves.toMatchObject({
      tenantId: saved.tenantId,
      authStatus: "active"
    });
    expect(contactSync.requests).toEqual([{ tenantId: saved.tenantId, tenantName: "Pilot Corp" }]);
    expect(events.syncFailures).toEqual([
      {
        eventKey: `wecom:sync:${saved.tenantId}:create_auth`,
        tenantId: saved.tenantId,
        eventType: "contact_sync",
        changeType: "create_auth",
        error: "contact sync unavailable"
      }
    ]);
  });

  it("retries failed authorization contact sync compensation events", async () => {
    const { service, contactSync, events } = createService();
    const saved = await service.handleAuthCode("auth-code-001");
    contactSync.requests = [];
    events.retryableSyncEvents = [
      {
        eventKey: `wecom:sync:${saved.tenantId}:create_auth`,
        tenantId: saved.tenantId,
        eventType: "contact_sync",
        changeType: "create_auth",
        payloadEncrypted: "",
        retryCount: 1
      }
    ];

    await expect(service.retryFailedContactSyncs({ tenantId: saved.tenantId })).resolves.toEqual({
      retriedCount: 1,
      succeededCount: 1,
      failedCount: 0,
      deadCount: 0
    });
    expect(contactSync.requests).toEqual([{ tenantId: saved.tenantId, tenantName: "Pilot Corp" }]);
    expect(events.doneKeys).toEqual([`wecom:sync:${saved.tenantId}:create_auth`]);
  });

  it("cancels authorization and removes reusable credentials", async () => {
    const { service, tenants } = createService();
    await service.handleAuthCode("auth-code-001");

    await expect(service.cancelAuthorization("corp-001", new Date("2026-07-08T10:00:00.000Z"))).resolves.toBe(true);
    await expect(tenants.getByOpenCorpid("corp-001")).resolves.toBeNull();
  });

  it("exchanges the same auth code only once across concurrent delivery paths", async () => {
    const { service, api } = createService();

    const [left, right] = await Promise.all([
      service.handleAuthCode("auth-code-001"),
      service.handleAuthCode("auth-code-001")
    ]);

    expect(left).toEqual(right);
    expect(api.permanentCodeRequestCount).toBe(1);
  });
});

class FakeSuiteTokenService {
  async getSuiteAccessToken(): Promise<WecomSuiteAccessTokenResult> {
    return {
      suiteId: "suite-id",
      accessToken: "suite-token",
      expiresAt: new Date("2026-07-06T12:00:00.000Z"),
      fromCache: true
    };
  }
}

class FakeWecomApiClient {
  permanentCodeRequestCount = 0;
  lastRequest: FetchPermanentCodeRequest | null = null;
  lastAuthorizationInfoRequest: FetchAuthorizationInfoRequest | null = null;
  nextResponse: FetchPermanentCodeResponse = {
    openCorpid: "corp-001",
    corpName: "Pilot Corp",
    permanentCode: "perm-001",
    agentId: "100001",
    authInfo: { agent: [{ agentid: 100001 }] }
  };

  async fetchPermanentCode(request: FetchPermanentCodeRequest): Promise<FetchPermanentCodeResponse> {
    this.permanentCodeRequestCount += 1;
    this.lastRequest = request;
    return this.nextResponse;
  }

  async fetchAuthorizationInfo(request: FetchAuthorizationInfoRequest): Promise<FetchAuthorizationInfoResponse> {
    this.lastAuthorizationInfoRequest = request;
    return {
      openCorpid: request.openCorpid,
      corpName: "Pilot Corp Changed",
      agentId: "100003",
      authInfo: { agent: [{ agentid: 100003 }] }
    };
  }
}

class FakeContactSyncService {
  requests: SyncTenantContactMembersInput[] = [];
  fail = false;

  async syncTenantMembers(input: SyncTenantContactMembersInput): Promise<void> {
    this.requests.push(input);
    if (this.fail) {
      throw new Error("contact sync unavailable");
    }
  }
}

class FakeCallbackEventRepository {
  syncFailures: Array<{
    eventKey: string;
    tenantId: string;
    eventType: string;
    changeType: string | null;
    error: string;
  }> = [];
  retryableSyncEvents: Array<{
    eventKey: string;
    tenantId: string | null;
    eventType: string;
    changeType: string | null;
    payloadEncrypted: string;
    retryCount: number;
  }> = [];
  doneKeys: string[] = [];
  failedKeys: string[] = [];

  async recordTenantSyncFailure(input: {
    eventKey: string;
    tenantId: string;
    eventType: string;
    changeType: string | null;
    error: unknown;
  }): Promise<void> {
    this.syncFailures.push({
      eventKey: input.eventKey,
      tenantId: input.tenantId,
      eventType: input.eventType,
      changeType: input.changeType,
      error: input.error instanceof Error ? input.error.message : String(input.error)
    });
  }

  async listRetryableSyncEvents(): Promise<typeof this.retryableSyncEvents> {
    return this.retryableSyncEvents;
  }

  async markDone(eventKey: string): Promise<void> {
    this.doneKeys.push(eventKey);
  }

  async markFailed(eventKey: string): Promise<void> {
    this.failedKeys.push(eventKey);
  }
}

function createService() {
  const api = new FakeWecomApiClient();
  const tenants = new WecomTenantAuthRepository(new DatabaseService(), new WecomStateCipherService());
  const contactSync = new FakeContactSyncService();
  const events = new FakeCallbackEventRepository();
  const settings = new WecomTenantSettingsRepository();
  const service = new WecomAuthorizationService(
    new FakeSuiteTokenService() as unknown as WecomSuiteTokenService,
    api as unknown as WecomApiClientService,
    tenants,
    contactSync as unknown as WecomContactSyncService,
    events as unknown as WecomCallbackEventRepository,
    settings
  );
  return { service, api, tenants, contactSync, events, settings };
}
