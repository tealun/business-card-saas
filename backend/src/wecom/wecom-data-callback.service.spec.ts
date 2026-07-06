import { BadRequestException } from "@nestjs/common";
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

  it("rejects callbacks from unauthorized tenants", async () => {
    const { service, crypto, tenants } = createService();
    crypto.message = contactXml("update_user");
    tenants.authorization = null;

    await expect(service.receive(callbackQuery(), "<xml><Encrypt><![CDATA[cipher]]></Encrypt></xml>")).rejects.toThrow(
      BadRequestException
    );
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
  receiveId = "suite-id";
  lastOptions: WecomDecryptOptions | null = null;

  decrypt(_payload: WecomEncryptedPayload, options?: WecomDecryptOptions) {
    this.lastOptions = options ?? null;
    return { message: this.message, receiveId: this.receiveId };
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
    return { syncedCount: input.users.length, skippedCount: 0 };
  }

  async disableMember(input: DisableWecomContactMemberInput): Promise<boolean> {
    this.lastDisable = input;
    return true;
  }
}

class FakeCallbackEventRepository {
  shouldProcess = true;
  lastBegin: BeginWecomCallbackEventInput | null = null;
  doneKeys: string[] = [];
  failedKeys: string[] = [];

  async beginProcessing(input: BeginWecomCallbackEventInput) {
    this.lastBegin = input;
    return {
      shouldProcess: this.shouldProcess,
      status: this.shouldProcess ? "processing" : "done",
      retryCount: 0
    };
  }

  async markDone(eventKey: string): Promise<void> {
    this.doneKeys.push(eventKey);
  }

  async markFailed(eventKey: string): Promise<void> {
    this.failedKeys.push(eventKey);
  }
}

function createService() {
  const config = new FakeConfigService();
  const crypto = new FakeCryptoService();
  const events = new FakeCallbackEventRepository();
  const tenants = new FakeTenantAuthRepository();
  const contacts = new FakeContactSyncRepository();
  const service = new WecomDataCallbackService(
    config as unknown as WecomConfigService,
    crypto as unknown as WecomCallbackCryptoService,
    events as unknown as WecomCallbackEventRepository,
    tenants as unknown as WecomTenantAuthRepository,
    contacts as unknown as WecomContactSyncRepository
  );
  return { service, crypto, events, tenants, contacts };
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
