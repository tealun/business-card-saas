import { DatabaseService } from "../database/database.service.js";
import { TenantTx, type TenantTransactionClient } from "../database/tenant-tx.service.js";
import { CardFieldCipherService } from "./card-field-cipher.service.js";
import { AdminManagementRepository } from "./admin-management.repository.js";

describe("AdminManagementRepository", () => {
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

  it("lists only current-tenant sync events without exposing encrypted payloads", async () => {
    const database = new FakeDatabaseService();
    const repository = new AdminManagementRepository(undefined, database as unknown as DatabaseService);

    const result = await repository.listSyncEvents({
      tenantId: "tenant-001",
      tenantName: "Pilot Corp",
      memberIdentityId: "member-001",
      openUserid: "ou-owner",
      role: "owner"
    });

    expect(database.lastValues).toEqual(["tenant-001"]);
    expect(database.lastQuery).toContain("WHERE tenant_id = $1");
    expect(result?.items[0]).toEqual({
      id: "42",
      source: "data",
      event_key: "wecom:data:event-001",
      event_type: "change_contact",
      change_type: "update_user",
      status: "done",
      retry_count: 1,
      received_at: "2026-07-06T12:00:00.000Z",
      processed_at: "2026-07-06T12:00:01.000Z",
      last_error: null
    });
  });

  it("lists members with tenant-scoped filters and pagination parameters", async () => {
    const transaction = new FakeMemberListTransaction();
    const repository = new AdminManagementRepository(
      new FakeTenantTx(transaction) as unknown as TenantTx,
      undefined,
      new FakeCipher() as unknown as CardFieldCipherService
    );

    const result = await repository.listMembers(
      {
        tenantId: "tenant-001",
        tenantName: "Pilot Corp",
        memberIdentityId: "member-001",
        openUserid: "ou-owner",
        role: "owner"
      },
      { search: "Alice_%", status: "active", limit: 25, offset: 50 }
    );

    expect(result?.total).toBe(12);
    expect(result?.items[0]).toMatchObject({
      member_identity_id: "101",
      display_name: "Alice",
      department: "技术部",
      title: "Engineer",
      mobile: null,
      email: null,
      card_status: "active",
      last_visit_at: "2026-07-10T08:00:00.000Z",
      status: "active"
    });
    expect(transaction.queries).toHaveLength(1);
    expect(transaction.queries[0]?.values).toEqual(["tenant-001", "active", "%Alice\\_\\%%", 25, 50]);
    expect(transaction.queries[0]?.text).toContain("member_identities.tenant_id = $1");
    expect(transaction.queries[0]?.text).toContain("AND (member_identities.name ILIKE $3");
    expect(transaction.queries[0]?.text).toContain("ILIKE $3 ESCAPE");
    expect(transaction.queries[0]?.text).toContain("LIMIT $4");
    expect(transaction.queries[0]?.text).toContain("OFFSET $5");
  });

it("updates member, primary card, and public directory status in tenant scope", async () => {
    const tenantTx = new FakeTenantTx();
    const repository = new AdminManagementRepository(tenantTx as unknown as TenantTx);

    await expect(
      repository.updateMemberStatus(
        {
          tenantId: "tenant-001",
          tenantName: "Pilot Corp",
          memberIdentityId: "member-001",
          openUserid: "ou-owner",
          role: "owner"
        },
        "member-001",
        "disabled"
      )
    ).resolves.toBe(true);

    expect(tenantTx.tenantId).toBe("tenant-001");
    expect(tenantTx.transaction.memberStatusParams).toEqual(["tenant-001", "member-001", "disabled"]);
    expect(tenantTx.transaction.cardStatusParams).toEqual(["tenant-001", "member-001", "disabled"]);
    expect(tenantTx.transaction.directoryStatusParams).toEqual(["pub_001", "tenant-001", "card-001", "disabled"]);
  });

  it("persists admin member card fields encrypted and reloads the stored card", async () => {
    const cipher = new FakeCipher();
    const transaction = new FakeCardTransaction(cipher);
    const tenantTx = new FakeTenantTx(transaction);
    const repository = new AdminManagementRepository(
      tenantTx as unknown as TenantTx,
      undefined,
      cipher as unknown as CardFieldCipherService
    );

    const result = await repository.updateMemberCard(
      {
        tenantId: "tenant-001",
        tenantName: "Pilot Corp",
        memberIdentityId: "member-001",
        openUserid: "ou-owner",
        role: "owner"
      },
      "member-001",
      {
        display_name: "Configured Name",
        title: "Sales Lead",
        fields: {
          mobile: "13800138000",
          email: "configured@example.com",
          wechat_id: "configured_wechat"
        },
        privacy: {
          show_mobile: true,
          show_wechat: true
        },
        status: "disabled"
      }
    );

    expect(result?.display_name).toBe("Configured Name");
    expect(result?.title).toBe("Sales Lead");
    expect(result?.fields).toMatchObject({
      mobile: "13800138000",
      email: "configured@example.com",
      wechat_id: "configured_wechat"
    });
    expect(result?.privacy).toEqual({
      show_mobile: true,
      show_email: true,
      show_wechat: true,
      allow_forward: true,
      show_avatar: true,
      share_title: null
    });
    expect(result?.status).toBe("disabled");
    expect(transaction.memberStatusParams).toEqual(["tenant-001", "member-001", "Configured Name", "disabled"]);
    expect(transaction.cardUpdateParams?.[6]).not.toContain("configured@example.com");
    expect(transaction.cardUpdateParams?.[6]).not.toContain("13800138000");
    expect(cipher.decrypt(String(transaction.cardUpdateParams?.[6]))).toContain("configured@example.com");
    expect(transaction.directoryStatusParams).toEqual(["pub_001", "tenant-001", "card-001", "disabled"]);
  });
});

class FakeDatabaseService {
  lastQuery = "";
  lastValues: unknown[] | undefined;

  async query<T>(text: string, values?: unknown[]): Promise<{ rows: T[] }> {
    this.lastQuery = text;
    this.lastValues = values;
    return {
      rows: [
        {
          id: "42",
          source: "data",
          event_key: "wecom:data:event-001",
          event_type: "change_contact",
          change_type: "update_user",
          status: "done",
          retry_count: 1,
          received_at: new Date("2026-07-06T12:00:00.000Z"),
          processed_at: new Date("2026-07-06T12:00:01.000Z"),
          last_error: null,
          payload_encrypted: "cipher",
          total_count: "1"
        } as T
      ]
    };
  }
}

class FakeTenantTx<
  TTransaction extends FakeTransaction | FakeCardTransaction | FakeMemberListTransaction = FakeTransaction
> {
  tenantId = "";
  transaction: TTransaction;

  constructor(transaction: TTransaction = new FakeTransaction() as TTransaction) {
    this.transaction = transaction;
  }

  async run<T>(tenantId: string, callback: (tx: TenantTransactionClient) => Promise<T>): Promise<T> {
    this.tenantId = tenantId;
    return callback(this.transaction as unknown as TenantTransactionClient);
  }
}

class FakeTransaction {
  memberStatusParams: unknown[] | undefined;
  cardStatusParams: unknown[] | undefined;
  directoryStatusParams: unknown[] | undefined;

  async query<T>(text: string, values?: unknown[]): Promise<{ rows: T[] }> {
    if (text.includes("UPDATE member_identities")) {
      this.memberStatusParams = values;
      return { rows: [{ id: "member-001" } as T] };
    }
    if (text.includes("UPDATE cards")) {
      this.cardStatusParams = values;
      return { rows: [{ id: "card-001", public_id: "pub_001" } as T] };
    }
    if (text.includes("INSERT INTO public_card_directory")) {
      this.directoryStatusParams = values;
      return { rows: [] };
    }
    return { rows: [] };
  }
}

class FakeMemberListTransaction {
  queries: Array<{ text: string; values: unknown[] | undefined }> = [];

  async query<T>(text: string, values?: unknown[]): Promise<{ rows: T[] }> {
    this.queries.push({ text, values });
    return {
      rows: [
        {
          id: "101",
          userid: "alice",
          open_userid: "ou-alice",
          name: "Alice",
          status: "active",
          public_id: "pub_alice",
          fields_encrypted: new FakeCipher().encrypt(JSON.stringify({ department: "技术部" })),
          title: "Engineer",
          email_encrypted: null,
          phone_encrypted: null,
          card_status: "active",
          last_visit_at: new Date("2026-07-10T08:00:00.000Z"),
          total_count: "12"
        } as T
      ]
    };
  }
}

class FakeCipher {
  encrypt(plaintext: string): string {
    return `enc.${Buffer.from(plaintext, "utf8").toString("base64url")}`;
  }

  decrypt(value: string): string {
    const ciphertext = value.startsWith("enc.") ? value.slice("enc.".length) : value;
    return Buffer.from(ciphertext, "base64url").toString("utf8");
  }
}

class FakeCardTransaction {
  memberStatusParams: unknown[] | undefined;
  cardUpdateParams: unknown[] | undefined;
  directoryStatusParams: unknown[] | undefined;
  private row: FakeCardRow;

  constructor(cipher: FakeCipher) {
    this.row = {
      member_id: "member-001",
      member_name: "Original Name",
      member_status: "active",
      card_id: "card-001",
      public_id: "pub_001",
      display_name: "Original Name",
      title: null,
      email_encrypted: null,
      phone_encrypted: null,
      fields_encrypted: cipher.encrypt(
        JSON.stringify({
          mobile: null,
          phone: null,
          email: "original@example.com",
          wechat_id: null,
          address: null
        })
      ),
      privacy_json: {
        show_mobile: false,
        show_email: true,
        show_wechat: false
      },
      card_status: "active"
    };
  }

  async query<T>(text: string, values?: unknown[]): Promise<{ rows: T[] }> {
    if (text.includes("member_identities.id AS member_id")) {
      return { rows: [{ ...this.row } as T] };
    }
    if (text.includes("UPDATE member_identities")) {
      this.memberStatusParams = values;
      this.row.member_name = String(values?.[2] ?? this.row.member_name);
      this.row.member_status = values?.[3] as "active" | "disabled";
      return { rows: [] };
    }
    if (text.includes("UPDATE cards")) {
      this.cardUpdateParams = values;
      this.row.display_name = String(values?.[2] ?? this.row.display_name);
      this.row.title = (values?.[3] as string | null) ?? null;
      this.row.email_encrypted = (values?.[4] as string | null) ?? null;
      this.row.phone_encrypted = (values?.[5] as string | null) ?? null;
      this.row.fields_encrypted = (values?.[6] as string | null) ?? null;
      this.row.privacy_json = JSON.parse(String(values?.[7] ?? "{}"));
      this.row.card_status = values?.[8] as "active" | "disabled";
      return { rows: [] };
    }
    if (text.includes("INSERT INTO public_card_directory")) {
      this.directoryStatusParams = values;
      return { rows: [] };
    }
    return { rows: [] };
  }
}

interface FakeCardRow {
  member_id: string;
  member_name: string;
  member_status: "active" | "disabled";
  card_id: string;
  public_id: string;
  display_name: string;
  title: string | null;
  email_encrypted: string | null;
  phone_encrypted: string | null;
  fields_encrypted: string | null;
  privacy_json: {
    show_mobile?: boolean;
    show_email?: boolean;
    show_wechat?: boolean;
  };
  card_status: "active" | "disabled";
}
