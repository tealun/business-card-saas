import { DatabaseService } from "../database/database.service.js";
import { WecomEmployeeProvisioningRepository } from "./wecom-employee-provisioning.repository.js";

describe("WecomEmployeeProvisioningRepository", () => {
  const originalDatabaseUrl = process.env.DATABASE_URL;

  beforeEach(() => {
    delete process.env.DATABASE_URL;
  });

  afterAll(() => {
    if (originalDatabaseUrl) {
      process.env.DATABASE_URL = originalDatabaseUrl;
    }
  });

  it("provisions and reuses the same member identity for repeated WeCom logins", async () => {
    const repository = new WecomEmployeeProvisioningRepository(new DatabaseService());

    const first = await repository.provision({
      tenantId: "tenant-001",
      tenantName: "Pilot Corp",
      openUserid: "ou-001"
    });
    const second = await repository.provision({
      tenantId: "tenant-001",
      tenantName: "Pilot Corp",
      openUserid: "ou-001"
    });

    expect(second).toEqual(first);
    expect(first.publicId).toMatch(/^pub_[A-Za-z0-9_-]{24}$/);
  });

  it("reuses the existing bound account when concurrent binding insert conflicts", async () => {
    process.env.DATABASE_URL = "postgres://localhost/business-card-test";
    const database = new FakeDatabaseService();
    const repository = new WecomEmployeeProvisioningRepository(database as unknown as DatabaseService);

    const employee = await repository.provision({
      tenantId: "1",
      tenantName: "Pilot Corp",
      openUserid: "ou-001"
    });

    expect(employee.accountId).toBe("acct-existing");
    expect(database.bindingLookupCount).toBe(2);
    expect(database.preferenceUpsertSql).toContain(
      "last_member_identity_id = COALESCE(account_preferences.last_member_identity_id, EXCLUDED.last_member_identity_id)"
    );
    const texts = database.tx.queries.map((query) => query.text);
    const indexOf = (needle: string) => texts.findIndex((text) => text.includes(needle));
    const firstTenantContext = texts.findIndex((text) => text.includes("set_config") && text.includes("app.tenant_id"));
    const newAccountContext = database.tx.queries.findIndex((query) =>
      query.text.includes("set_config") && query.text.includes("app.account_id") && query.values?.[0] === "acct-new"
    );
    const preferenceWrite = indexOf("INSERT INTO account_preferences");
    const accountContextsBeforePreference = database.tx.queries
      .slice(0, preferenceWrite)
      .filter((query) => query.text.includes("set_config") && query.text.includes("app.account_id"))
      .map((query) => query.values);

    expect(firstTenantContext).toBeLessThan(indexOf("INSERT INTO member_identities"));
    expect(newAccountContext).toBeLessThan(indexOf("INSERT INTO account_identity_bindings"));
    expect(accountContextsBeforePreference[accountContextsBeforePreference.length - 1]).toEqual(["acct-existing"]);
  });
});

class FakeDatabaseService {
  readonly tx = new FakeTransaction(this);
  bindingLookupCount = 0;
  preferenceUpsertSql = "";

  async transaction<T>(callback: (tx: FakeTransaction) => Promise<T>): Promise<T> {
    return callback(this.tx);
  }
}

class FakeTransaction {
  readonly queries: Array<{ text: string; values?: unknown[] }> = [];

  constructor(private readonly database: FakeDatabaseService) {}

  async query<T>(text: string, values?: unknown[]): Promise<{ rows: T[] }> {
    this.queries.push(values === undefined ? { text } : { text, values });
    if (text.includes("INSERT INTO member_identities")) {
      return { rows: [{ id: "member-1", name: "ou-001" } as T] };
    }
    if (text.includes("SELECT account_id")) {
      this.database.bindingLookupCount += 1;
      return {
        rows: this.database.bindingLookupCount === 1 ? [] : [{ account_id: "acct-existing" } as T]
      };
    }
    if (text.includes("INSERT INTO accounts")) {
      return { rows: [{ id: "acct-new" } as T] };
    }
    if (text.includes("INSERT INTO account_identity_bindings")) {
      return { rows: [] };
    }
    if (text.includes("INSERT INTO account_preferences")) {
      this.database.preferenceUpsertSql = text;
      return { rows: [] };
    }
    if (text.includes("SELECT id, public_id")) {
      return { rows: [{ id: "card-1", public_id: "pub_existing0001" } as T] };
    }
    return { rows: [] };
  }
}
