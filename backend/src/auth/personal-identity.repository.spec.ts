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
