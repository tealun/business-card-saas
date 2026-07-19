import { DatabaseService } from "../database/database.service.js";
import { PersonalIdentityRepository } from "./personal-identity.repository.js";

describe("PersonalIdentityRepository", () => {
  const originalDatabaseUrl = process.env.DATABASE_URL;

  beforeEach(() => {
    process.env.DATABASE_URL = "postgres://localhost/business-card-test";
  });

  afterAll(() => {
    if (originalDatabaseUrl) {
      process.env.DATABASE_URL = originalDatabaseUrl;
    } else {
      delete process.env.DATABASE_URL;
    }
  });

  it("prefers the last selected identity over the login fallback identity", async () => {
    const repository = new PersonalIdentityRepository(new FakeDatabaseService() as unknown as DatabaseService);

    const result = await repository.preferredAccountIdentity("acct-1", "member-personal");

    expect(result.current?.memberIdentityId).toBe("member-enterprise");
    expect(result.current?.identityType).toBe("wecom_member");
    expect(result.identities.map((identity) => identity.memberIdentityId)).toEqual([
      "member-personal",
      "member-enterprise"
    ]);
  });

  it("uses the current login identity over a stale personal preference", async () => {
    const db = new LoginIdentityDatabaseService();
    const repository = new PersonalIdentityRepository(db as unknown as DatabaseService);

    const result = await repository.loginAccountIdentity("acct-1", {
      accountId: "acct-1",
      identityType: "wecom_member",
      tenantId: "tenant-enterprise",
      tenantName: "Pilot Corp",
      memberIdentityId: "member-enterprise",
      displayName: "Ada",
      openUserid: "ou-1",
      publicId: "pub_enterprise"
    });

    expect(result.current.memberIdentityId).toBe("member-enterprise");
    expect(result.current.identityType).toBe("wecom_member");
    expect(db.tx.queries.some((query) => query.text.includes("INSERT INTO account_preferences"))).toBe(true);
    expect(db.tx.queries.find((query) => query.text.includes("INSERT INTO account_preferences"))?.values).toEqual([
      "acct-1",
      "member-enterprise"
    ]);
  });

  it("sets RLS tenant/account context before writing to any RLS-protected table", async () => {
    const db = new RecordingDatabaseService();
    const repository = new PersonalIdentityRepository(db as unknown as DatabaseService);

    await repository.provisionFromWxSession({ openid: "openid-1", unionid: "unionid-1", sessionKey: null });

    const texts = db.tx.queries.map((query) => query.text);
    const indexOf = (needle: string) => texts.findIndex((text) => text.includes(needle));

    const setAccountCtx = texts.findIndex((t) => t.includes("set_config") && t.includes("app.account_id"));
    const setTenantCtx = texts.findIndex((t) => t.includes("set_config") && t.includes("app.tenant_id"));

    expect(setAccountCtx).toBeGreaterThanOrEqual(0);
    expect(setTenantCtx).toBeGreaterThanOrEqual(0);
    // Context must be established before the first RLS-protected write, or the policy rejects it.
    expect(setTenantCtx).toBeLessThan(indexOf("INSERT INTO member_identities"));
    expect(setTenantCtx).toBeLessThan(indexOf("INSERT INTO cards"));
    expect(setAccountCtx).toBeLessThan(indexOf("INSERT INTO account_identity_bindings"));
    // But after accounts/tenants, which carry no RLS and provide the ids fed into the context.
    expect(setAccountCtx).toBeGreaterThan(indexOf("INSERT INTO accounts"));
    expect(setTenantCtx).toBeGreaterThan(indexOf("INSERT INTO tenants"));
  });

  it("adopts a bare wecom identity into the WeChat account and marks it last-used", async () => {
    const db = new RecordingDatabaseService();
    const repository = new PersonalIdentityRepository(db as unknown as DatabaseService);

    const adopted = await repository.adoptWecomIdentity({
      wxAccountId: "wx-account-1",
      tenantId: "tenant-enterprise",
      memberIdentityId: "member-enterprise"
    });

    expect(adopted).toBe("wx-account-1");
    const texts = db.tx.queries.map((query) => query.text);
    const setTenantCtx = texts.findIndex((t) => t.includes("set_config") && t.includes("app.tenant_id"));
    const bindingUpdate = texts.findIndex((t) => t.includes("UPDATE account_identity_bindings"));
    const preferenceWrite = texts.findIndex((t) => t.includes("INSERT INTO account_preferences"));
    expect(setTenantCtx).toBeGreaterThanOrEqual(0);
    expect(setTenantCtx).toBeLessThan(bindingUpdate);
    expect(preferenceWrite).toBeGreaterThan(bindingUpdate);
    // 只归并挂在无微信标识账号上的身份，防止抢占他人微信已绑定的企业身份。
    expect(texts[bindingUpdate]).toContain("wx_unionid IS NULL");
    expect(texts[bindingUpdate]).toContain("primary_wx_openid IS NULL");
  });

  it("does not adopt a wecom identity already owned by another WeChat account", async () => {
    const db = new RecordingDatabaseService();
    db.tx.bindingUpdateRows = [];
    const repository = new PersonalIdentityRepository(db as unknown as DatabaseService);

    const adopted = await repository.adoptWecomIdentity({
      wxAccountId: "wx-account-1",
      tenantId: "tenant-enterprise",
      memberIdentityId: "member-enterprise"
    });

    expect(adopted).toBeNull();
    const texts = db.tx.queries.map((query) => query.text);
    expect(texts.some((t) => t.includes("INSERT INTO account_preferences"))).toBe(false);
  });

  it("locks the WeChat account keys before selecting or inserting an account", async () => {
    const repository = new PersonalIdentityRepository({} as DatabaseService) as unknown as {
      findOrCreateAccount(input: { openid: string; unionid: string | null }, tx: AccountCreationTransaction): Promise<string>;
    };
    const tx = new AccountCreationTransaction();

    const accountId = await repository.findOrCreateAccount({ openid: "openid-1", unionid: "unionid-1" }, tx);

    expect(accountId).toBe("account-1");
    expect(tx.queries.map((query) => query.text)).toEqual([
      expect.stringContaining("pg_advisory_xact_lock"),
      expect.stringContaining("pg_advisory_xact_lock"),
      expect.stringContaining("SELECT id"),
      expect.stringContaining("INSERT INTO accounts")
    ]);
    expect(tx.queries.slice(0, 2).map((query) => query.values)).toEqual([
      ["account:openid:openid-1"],
      ["account:unionid:unionid-1"]
    ]);
  });
});

class FakeDatabaseService {
  async transaction<T>(callback: (tx: FakeTransaction) => Promise<T>): Promise<T> {
    return callback(new FakeTransaction());
  }
}

class FakeTransaction {
  async query<T>(text: string): Promise<{ rows: T[] }> {
    if (text.includes("FROM account_identity_bindings b")) {
      return {
        rows: [
          {
            tenant_id: "tenant-personal",
            tenant_name: "个人名片",
            tenant_type: "personal",
            member_identity_id: "member-personal",
            display_name: "我的名片",
            open_userid: "wx:openid-1",
            public_id: "pub_personal"
          },
          {
            tenant_id: "tenant-enterprise",
            tenant_name: "Pilot Corp",
            tenant_type: "enterprise",
            member_identity_id: "member-enterprise",
            display_name: "Ada",
            open_userid: "ou-1",
            public_id: "pub_enterprise"
          }
        ] as T[]
      };
    }
    if (text.includes("FROM account_preferences")) {
      return {
        rows: [
          {
            last_member_identity_id: "member-enterprise",
            default_member_identity_id: "member-personal"
          } as T
        ]
      };
    }
    return { rows: [] };
  }
}

class LoginIdentityDatabaseService {
  readonly tx = new LoginIdentityTransaction();

  async transaction<T>(callback: (tx: LoginIdentityTransaction) => Promise<T>): Promise<T> {
    return callback(this.tx);
  }
}

class LoginIdentityTransaction {
  readonly queries: Array<{ text: string; values?: unknown[] }> = [];

  async query<T>(text: string, values?: unknown[]): Promise<{ rows: T[] }> {
    this.queries.push(values === undefined ? { text } : { text, values });
    if (text.includes("FROM account_identity_bindings b")) {
      return {
        rows: [
          {
            tenant_id: "tenant-personal",
            tenant_name: "涓汉鍚嶇墖",
            tenant_type: "personal",
            member_identity_id: "member-personal",
            display_name: "鎴戠殑鍚嶇墖",
            open_userid: "wx:openid-1",
            public_id: "pub_personal"
          },
          {
            tenant_id: "tenant-enterprise",
            tenant_name: "Pilot Corp",
            tenant_type: "enterprise",
            member_identity_id: "member-enterprise",
            display_name: "Ada",
            open_userid: "ou-1",
            public_id: "pub_enterprise"
          }
        ] as T[]
      };
    }
    return { rows: [] };
  }
}

class RecordingDatabaseService {
  readonly tx = new RecordingTransaction();

  async transaction<T>(callback: (tx: RecordingTransaction) => Promise<T>): Promise<T> {
    return callback(this.tx);
  }
}

class RecordingTransaction {
  readonly queries: Array<{ text: string; values?: unknown[] }> = [];
  bindingUpdateRows: Array<{ account_id: string }> = [{ account_id: "wx-account-1" }];

  async query<T>(text: string, values?: unknown[]): Promise<{ rows: T[] }> {
    this.queries.push(values === undefined ? { text } : { text, values });
    if (text.includes("UPDATE account_identity_bindings")) {
      return { rows: this.bindingUpdateRows as T[] };
    }
    if (text.includes("INSERT INTO accounts")) {
      return { rows: [{ id: "account-1" } as T] };
    }
    if (text.includes("INSERT INTO tenants")) {
      return { rows: [{ id: "tenant-1", name: "个人名片" } as T] };
    }
    if (text.includes("INSERT INTO member_identities")) {
      return { rows: [{ id: "member-1", name: "我的名片", open_userid: "wx:openid-1" } as T] };
    }
    if (text.includes("INSERT INTO cards")) {
      return { rows: [{ id: "card-1", public_id: "pub_personal" } as T] };
    }
    if (text.includes("SELECT id") && text.includes("FROM accounts")) {
      return { rows: [] };
    }
    return { rows: [] };
  }
}

class AccountCreationTransaction {
  readonly queries: Array<{ text: string; values?: unknown[] }> = [];

  async query<T>(text: string, values?: unknown[]): Promise<{ rows: T[] }> {
    this.queries.push(values === undefined ? { text } : { text, values });
    if (text.includes("SELECT id") && text.includes("FROM accounts")) {
      return { rows: [] };
    }
    if (text.includes("INSERT INTO accounts")) {
      return { rows: [{ id: "account-1" } as T] };
    }
    return { rows: [] };
  }
}
