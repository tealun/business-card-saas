import { BadRequestException } from "@nestjs/common";
import { WecomCallbackAlertService } from "./wecom-callback-alert.service.js";
import { WecomCallbackEventRepository, type BeginWecomCallbackEventInput } from "./wecom-callback-event.repository.js";
import { WecomCallbackCryptoService, type WecomDecryptOptions, type WecomEncryptedPayload } from "./wecom-callback-crypto.service.js";
import { WecomConfigService, type WecomSuiteConfig } from "./wecom-config.service.js";
import {
  WecomContactSyncRepository,
  type DisableWecomContactMemberInput,
  type SyncWecomContactMembersInput
} from "./wecom-contact-sync.repository.js";
import { WecomDataCallbackService } from "./wecom-data-callback.service.js";
import { WecomTenantAuthRepository, type TenantAuthorizationSnapshot } from "./wecom-tenant-auth.repository.js";

describe("WecomDataCallbackService", () => {
  it("upserts members for create and update contact callbacks", async () => {
    const { service, crypto, events, tenants, contacts } = createService();
    crypto.message = contactXml("create_user");

    const result = await service.receive(callbackQuery(), "<xml><Encrypt><![CDATA[cipher]]></Encrypt></xml>");

    expect(result).toEqual({ event: "change_contact", changeType: "create_user", tenantId: "tenant-001", handled: true });
    expect(tenants.lastOpenCorpid).toBe("corp-001");
    expect(contacts.lastUpsert?.users).toEqual([
      {
        userid: "user-001",
        openUserid: "ou-001",
        name: "Ada",
        departmentIds: ["1", "2"],
        status: "active"
      }
    ]);
    expect(crypto.lastOptions?.token).toBe("data-token");
    expect(crypto.lastOptions?.expectedReceiveId).toBeNull();
    expect(events.lastBegin?.eventType).toBe("change_contact");
    expect(events.doneKeys).toHaveLength(1);
  });

  it("disables existing members for delete contact callbacks", async () => {
    const { service, crypto, contacts } = createService();
    crypto.message = contactXml("delete_user");

    const result = await service.receive(callbackQuery(), "<xml><Encrypt><![CDATA[cipher]]></Encrypt></xml>");

    expect(result).toEqual({ event: "change_contact", changeType: "delete_user", tenantId: "tenant-001", handled: true });
    expect(contacts.lastDisable).toEqual({
      tenantId: "tenant-001",
      userid: "user-001",
      openUserid: "ou-001"
    });
    expect(contacts.lastUpsert).toBeNull();
  });

  it("uses NewUserID when Enterprise WeChat reports a userid change", async () => {
    const { service, crypto, contacts } = createService();
    crypto.message = contactXml("update_user").replace(
      "<UserID><![CDATA[user-001]]></UserID>",
      "<UserID><![CDATA[user-old]]></UserID><NewUserID><![CDATA[user-new]]></NewUserID>"
    );

    await service.receive(callbackQuery(), "<xml><Encrypt><![CDATA[cipher]]></Encrypt></xml>");

    expect(contacts.lastUpsert?.users[0]?.userid).toBe("user-new");
  });

  it("skips business work for duplicate callback events already in progress or done", async () => {
    const { service, crypto, events, contacts } = createService();
    crypto.message = contactXml("update_user");
    events.shouldProcess = false;

    const result = await service.receive(callbackQuery(), "<xml><Encrypt><![CDATA[cipher]]></Encrypt></xml>");

    expect(result).toEqual({ event: "change_contact", changeType: "update_user", tenantId: "tenant-001", handled: true });
    expect(contacts.lastUpsert).toBeNull();
    expect(events.doneKeys).toEqual([]);
  });

  it("marks callback events failed when member processing fails", async () => {
    const { service, crypto, events, contacts } = createService();
    crypto.message = contactXml("update_user");
    contacts.failUpsert = true;

    await expect(service.receive(callbackQuery(), "<xml><Encrypt><![CDATA[cipher]]></Encrypt></xml>")).rejects.toThrow(
      "sync failed"
    );
    expect(events.failedKeys).toHaveLength(1);
  });

  it("retries failed callback events from stored encrypted payloads", async () => {
    const { service, crypto, events, contacts } = createService();
    crypto.retryMessage = contactXml("update_user");
    events.retryable = [
      {
        eventKey: "event-retry-001",
        tenantId: "tenant-001",
        eventType: "change_contact",
        changeType: "update_user",
        payloadEncrypted: "cipher",
        retryCount: 1
      }
    ];

    const result = await service.retryFailedEvents();

    expect(result).toEqual({ retriedCount: 1, succeededCount: 1, failedCount: 0, deadCount: 0 });
    expect(crypto.retryDecrypts).toBe(1);
    expect(contacts.lastUpsert?.users[0]?.userid).toBe("user-001");
    expect(events.doneKeys).toHaveLength(1);
  });

  it("dead-letters failed retry events after the retry budget is exhausted", async () => {
    const { service, crypto, events, contacts, alerts } = createService();
    crypto.retryMessage = contactXml("update_user");
    contacts.failUpsert = true;
    events.beginRetryCount = 5;
    events.retryable = [
      {
        eventKey: "event-retry-002",
        tenantId: "tenant-001",
        eventType: "change_contact",
        changeType: "update_user",
        payloadEncrypted: "cipher",
        retryCount: 4
      }
    ];

    await expect(service.retryFailedEvents()).resolves.toEqual({
      retriedCount: 1,
      succeededCount: 0,
      failedCount: 1,
      deadCount: 1
    });
    expect(events.failedRecords[0]?.deadLetter).toBe(true);
    expect(alerts.deadLetters).toEqual([
      {
        eventKey: expect.any(String),
        retryCount: 5,
        errorType: "Error"
      }
    ]);
  });

  it("records unauthorized tenant callbacks and returns success so WeCom stops retrying", async () => {
    const { service, crypto, tenants } = createService();
    crypto.message = contactXml("update_user");
    tenants.authorization = null;

    const result = await service.receive(
      callbackQuery(),
      "<xml><Encrypt><![CDATA[cipher]]></Encrypt></xml>"
    );

    expect(result.event).toBe("change_contact");
    expect(result.tenantId).toBe("");
    expect(result.handled).toBe(false);
  });

  it("rejects callbacks when the encrypted receiver and message corp id differ", async () => {
    const { service, crypto } = createService();
    crypto.message = contactXml("update_user").replace("suite-id", "suite-other");

    await expect(service.receive(callbackQuery(), "<xml><Encrypt><![CDATA[cipher]]></Encrypt></xml>")).rejects.toThrow(
      "WeCom data callback receiver mismatch"
    );
  });
});

class FakeConfigService {
  suite: WecomSuiteConfig = {
    providerCorpId: "wwprovider0001",
    suiteId: "suite-id",
    suiteSecret: "suite-secret",
    callbackToken: "command-token",
    callbackAesKey: "abcdefghijklmnopqrstuvwxyz0123456789ABCDEFG",
    dataCallbackToken: "data-token",
    dataCallbackAesKey: "abcdefghijklmnopqrstuvwxyz0123456789ABCDEFG"
  };
}

class FakeCryptoService {
  message = "";
  retryMessage = "";
  receiveId = "suite-id";
  lastOptions: WecomDecryptOptions | null = null;
  retryDecrypts = 0;

  decrypt(_payload: WecomEncryptedPayload, options?: WecomDecryptOptions) {
    this.lastOptions = options ?? null;
    return { message: this.message, receiveId: this.receiveId };
  }

  decryptTrustedCiphertext(_encrypt: string, options?: WecomDecryptOptions) {
    this.lastOptions = options ?? null;
    this.retryDecrypts += 1;
    return { message: this.retryMessage || this.message, receiveId: this.receiveId };
  }
}

class FakeTenantAuthRepository {
  lastOpenCorpid: string | null = null;
  authorization: TenantAuthorizationSnapshot | null = {
    tenantId: "tenant-001",
    openCorpid: "corp-001",
    corpName: "Pilot Corp",
    permanentCode: "perm-001",
    agentId: "100001",
    authStatus: "active"
  };

  async getByOpenCorpid(openCorpid: string): Promise<TenantAuthorizationSnapshot | null> {
    this.lastOpenCorpid = openCorpid;
    return this.authorization;
  }
}

class FakeContactSyncRepository {
  lastUpsert: SyncWecomContactMembersInput | null = null;
  lastDisable: DisableWecomContactMemberInput | null = null;
  failUpsert = false;

  async upsertMembers(input: SyncWecomContactMembersInput) {
    if (this.failUpsert) {
      throw new Error("sync failed");
    }
    this.lastUpsert = input;
    return { syncedCount: input.users.length, skippedCount: 0, disabledCount: 0 };
  }

  async disableMember(input: DisableWecomContactMemberInput): Promise<boolean> {
    this.lastDisable = input;
    return true;
  }
}

class FakeCallbackAlertService {
  deadLetters: Array<{ eventKey: string; retryCount: number; errorType: string }> = [];

  async notifyDeadLetter(input: { eventKey: string; retryCount: number; errorType: string }) {
    this.deadLetters.push({
      eventKey: input.eventKey,
      retryCount: input.retryCount,
      errorType: input.errorType
    });
    return { sent: true, status: 200, skipped: false };
  }
}

class FakeCallbackEventRepository {
  shouldProcess = true;
  beginRetryCount = 0;
  lastBegin: BeginWecomCallbackEventInput | null = null;
  doneKeys: string[] = [];
  failedKeys: string[] = [];
  failedRecords: Array<{ eventKey: string; deadLetter: boolean }> = [];
  retryable: Array<{
    eventKey: string;
    tenantId: string | null;
    eventType: string;
    changeType: string | null;
    payloadEncrypted: string;
    retryCount: number;
  }> = [];

  async beginProcessing(input: BeginWecomCallbackEventInput) {
    this.lastBegin = input;
    return {
      shouldProcess: this.shouldProcess,
      status: this.shouldProcess ? "processing" : "done",
      retryCount: this.beginRetryCount
    };
  }

  async markDone(eventKey: string): Promise<void> {
    this.doneKeys.push(eventKey);
  }

  async markFailed(
    eventKey: string,
    _error?: unknown,
    _tenantId?: string | null,
    options?: { deadLetter?: boolean }
  ): Promise<void> {
    this.failedKeys.push(eventKey);
    this.failedRecords.push({ eventKey, deadLetter: Boolean(options?.deadLetter) });
  }

  async listRetryableDataEvents() {
    return this.retryable;
  }
}

function createService() {
  const config = new FakeConfigService();
  const crypto = new FakeCryptoService();
  const events = new FakeCallbackEventRepository();
  const tenants = new FakeTenantAuthRepository();
  const contacts = new FakeContactSyncRepository();
  const alerts = new FakeCallbackAlertService();
  const service = new WecomDataCallbackService(
    config as unknown as WecomConfigService,
    crypto as unknown as WecomCallbackCryptoService,
    events as unknown as WecomCallbackEventRepository,
    tenants as unknown as WecomTenantAuthRepository,
    contacts as unknown as WecomContactSyncRepository,
    alerts as unknown as WecomCallbackAlertService
  );
  return { service, crypto, events, tenants, contacts, alerts };
}

function callbackQuery() {
  return { msgSignature: "sig", timestamp: "1700000000", nonce: "nonce" };
}

function contactXml(changeType: string): string {
  return `
    <xml>
      <SuiteId><![CDATA[suite-id]]></SuiteId>
      <AuthCorpId><![CDATA[corp-001]]></AuthCorpId>
      <InfoType><![CDATA[change_contact]]></InfoType>
      <ChangeType><![CDATA[${changeType}]]></ChangeType>
      <UserID><![CDATA[user-001]]></UserID>
      <OpenUserID><![CDATA[ou-001]]></OpenUserID>
      <Name><![CDATA[Ada]]></Name>
      <Department><![CDATA[1,2]]></Department>
    </xml>
  `;
}
