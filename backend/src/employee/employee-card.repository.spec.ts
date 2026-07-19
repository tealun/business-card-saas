import { EmployeeCardRepository } from "./employee-card.repository.js";
import { publicCardResponseSchema } from "../contracts/public-card.js";
import type { EmployeeCardResponse } from "../contracts/employee-card.js";

describe("EmployeeCardRepository", () => {
  it("aligns card status with the current employee session", async () => {
    const repository = new EmployeeCardRepository();

    const card = await repository.getCurrentCard({
      accountId: "acct-001",
      tenantId: "tenant-001",
      tenantName: "Pilot Corp",
      memberIdentityId: "member-001",
      displayName: "Ada",
      openUserid: "ou-001",
      publicId: "pub_001",
      status: "disabled"
    });
    const preview = await repository.getPreview({
      accountId: "acct-001",
      tenantId: "tenant-001",
      tenantName: "Pilot Corp",
      memberIdentityId: "member-001",
      displayName: "Ada",
      openUserid: "ou-001",
      publicId: "pub_001",
      status: "disabled"
    });

    expect(card.status).toBe("disabled");
    expect(card.employee_self_service).toEqual({
      allow_privacy_edit: true,
      allow_share_edit: true,
      allow_wecom_qrcode_upload: true,
      qrcode_source: "enterprise_first"
    });
    expect(preview.status).toBe("disabled");
  });

  it("returns zero stats without a database", async () => {
    const repository = new EmployeeCardRepository();
    await expect(
      repository.getCurrentCardStats({
        accountId: "acct-001",
        tenantId: "tenant-001",
        memberIdentityId: "member-001",
        openUserid: "ou-001"
      })
    ).resolves.toEqual({ visitor_count: 0, visit_count: 0, recent_visitors: [] });
  });

  it("updates avatar for a fully editable personal card", async () => {
    const repository = new EmployeeCardRepository();
    const session = {
      accountId: "acct-001",
      identityType: "personal" as const,
      tenantId: "tenant-001",
      tenantName: "Personal",
      memberIdentityId: "member-001",
      displayName: "Ada",
      openUserid: "ou-001",
      publicId: "pub_001"
    };

    const card = await repository.updateCurrentCard(session, {
      avatar_url: "data:image/jpeg;base64,ZmFrZQ=="
    });

    expect(card.avatar_url).toBe("data:image/jpeg;base64,ZmFrZQ==");
    expect(card.editable_fields).toContain("avatar_url");
  });

  it("updates personal-only organization fields without tenant field locks", async () => {
    const repository = new EmployeeCardRepository();
    const session = {
      accountId: "acct-001",
      identityType: "personal" as const,
      tenantId: "tenant-001",
      tenantName: "Personal",
      memberIdentityId: "member-001",
      displayName: "Ada",
      openUserid: "ou-001",
      publicId: "pub_001"
    };

    const card = await repository.updateCurrentCard(session, {
      fields: {
        department: "Freelance Studio",
        website: "https://ada.example.com"
      }
    });

    expect(card.fields.department).toBe("Freelance Studio");
    expect(card.fields.website).toBe("https://ada.example.com");
    expect(card.editable_fields).toEqual(
      expect.arrayContaining(["department", "website", "avatar_url", "address"])
    );
  });

  it("does not publish invalid legacy contact URLs or emails", async () => {
    const repository = new EmployeeCardRepository();
    const session = {
      accountId: "acct-001",
      identityType: "personal" as const,
      tenantId: "tenant-001",
      tenantName: "Personal",
      memberIdentityId: "member-legacy",
      displayName: "Ada",
      openUserid: "ou-001",
      publicId: "pub_legacy01"
    };
    const legacyCard: EmployeeCardResponse = {
      card_id: "member-legacy",
      public_id: "pub_legacy01",
      display_name: "Ada",
      title: null,
      company: "Personal",
      avatar_url: null,
      fields: {
        department: null,
        mobile: null,
        phone: null,
        email: "not-an-email",
        wechat_id: null,
        address: null,
        website: ""
      },
      status: "active",
      privacy: {
        show_mobile: false,
        show_email: true,
        show_wechat: false,
        allow_forward: true,
        show_avatar: true,
        share_title: null
      }
    };

    (repository as unknown as { cards: Map<string, EmployeeCardResponse> }).cards.set("tenant-001:member-legacy", legacyCard);

    const preview = await repository.getPreview(session);

    expect(() => publicCardResponseSchema.parse(preview)).not.toThrow();
    expect(preview.card.fields.email).toBeNull();
    expect(preview.company_profile.website_url).toBeNull();
  });

  it("persists the custom share title and hides the avatar from previews", async () => {
    const repository = new EmployeeCardRepository();
    const session = {
      accountId: "acct-share",
      identityType: "personal" as const,
      tenantId: "tenant-share",
      tenantName: "Personal",
      memberIdentityId: "member-share",
      displayName: "Ada",
      openUserid: "ou-share",
      publicId: "pub_share001"
    };

    await repository.updateCurrentCard(session, {
      avatar_url: "https://example.com/avatar.png",
      privacy: { show_avatar: false, share_title: "欢迎查看我的名片" }
    });
    const card = await repository.getCurrentCard(session);
    const preview = await repository.getPreview(session);

    expect(card.privacy).toMatchObject({ show_avatar: false, share_title: "欢迎查看我的名片" });
    expect(preview).toMatchObject({ show_avatar: false, share_title: "欢迎查看我的名片" });
    expect(preview.card.avatar_url).toBeNull();
  });

  it("materializes avatar data URLs through configured storage before saving", async () => {
    const storage = {
      storeImageDataUrl: jest.fn(async () => ({
        storageKey: "tenant/tenant-001/avatars/avatar.png",
        publicUrl: "http://localhost:3000/api/v1/storage/tenant/tenant-001/avatars/avatar.png"
      }))
    };
    const repository = new EmployeeCardRepository(undefined, undefined, storage as never);
    const session = {
      accountId: "acct-001",
      identityType: "personal" as const,
      tenantId: "tenant-001",
      tenantName: "Personal",
      memberIdentityId: "member-001",
      displayName: "Ada",
      openUserid: "ou-001",
      publicId: "pub_001"
    };

    const card = await repository.updateCurrentCard(session, {
      avatar_url: "data:image/png;base64,aGVsbG8="
    });

    expect(storage.storeImageDataUrl).toHaveBeenCalledWith({
      tenantId: "tenant-001",
      category: "avatars",
      dataUrl: "data:image/png;base64,aGVsbG8="
    });
    expect(card.avatar_url).toBe("http://localhost:3000/api/v1/storage/tenant/tenant-001/avatars/avatar.png");
  });

  it("materializes custom card background data URLs through configured storage before saving style", async () => {
    const storage = {
      storeImageDataUrl: jest.fn(async () => ({
        storageKey: "tenant/tenant-001/card-backgrounds/background.png",
        publicUrl: "http://localhost:3000/api/v1/storage/tenant/tenant-001/card-backgrounds/background.png"
      }))
    };
    const repository = new EmployeeCardRepository(undefined, undefined, storage as never);
    const session = {
      accountId: "acct-001",
      identityType: "personal" as const,
      tenantId: "tenant-001",
      tenantName: "Personal",
      memberIdentityId: "member-001",
      displayName: "Ada",
      openUserid: "ou-001",
      publicId: "pub_001"
    };

    const preview = await repository.updateStyle(session, {
      background_url: "data:image/png;base64,aGVsbG8=",
      color_scheme: { primary: "#8d7ec7" }
    });

    expect(storage.storeImageDataUrl).toHaveBeenCalledWith({
      tenantId: "tenant-001",
      category: "card-backgrounds",
      dataUrl: "data:image/png;base64,aGVsbG8="
    });
    expect(preview.template.background_url).toBe(
      "http://localhost:3000/api/v1/storage/tenant/tenant-001/card-backgrounds/background.png"
    );
  });

  it("syncs WeCom sensitive profile details and reports authorization status", async () => {
    const repository = new EmployeeCardRepository();
    const session = {
      accountId: "acct-001",
      identityType: "wecom_member" as const,
      tenantId: "tenant-001",
      tenantName: "Pilot Corp",
      memberIdentityId: "member-wecom",
      displayName: "zhangsan",
      openUserid: "zhangsan",
      publicId: "pub_wecom001"
    };

    await expect(repository.getWecomSensitiveStatus(session)).resolves.toMatchObject({
      eligible: true,
      authorized: false,
      should_authorize: true
    });

    const card = await repository.syncWecomSensitiveProfile(session, {
      name: "张三",
      title: "销售总监",
      mobile: "13800138000",
      email: "zhangsan@example.com",
      avatarUrl: "https://images.example.com/avatar.png",
      qrCodeUrl: "https://images.example.com/qr.png"
    });

    expect(card).toMatchObject({
      display_name: "张三",
      title: "销售总监",
      avatar_url: "https://images.example.com/avatar.png",
      fields: {
        mobile: "13800138000",
        email: "zhangsan@example.com",
        wecom_qrcode_url: "https://images.example.com/qr.png"
      }
    });
    await expect(repository.getWecomSensitiveStatus(session)).resolves.toMatchObject({
      eligible: true,
      authorized: true,
      should_authorize: false,
      synced_fields: ["profile", "avatar", "qrcode"]
    });
  });

  it("keeps bundled preset card background paths without storage upload", async () => {
    const storage = {
      storeImageDataUrl: jest.fn()
    };
    const repository = new EmployeeCardRepository(undefined, undefined, storage as never);
    const session = {
      accountId: "acct-001",
      identityType: "personal" as const,
      tenantId: "tenant-001",
      tenantName: "Personal",
      memberIdentityId: "member-001",
      displayName: "Ada",
      openUserid: "ou-001",
      publicId: "pub_001"
    };

    const preview = await repository.updateStyle(session, {
      background_url: "/assets/card-backgrounds/bg-light-wave.webp",
      color_scheme: { primary: "#5a70c8" }
    });

    expect(storage.storeImageDataUrl).not.toHaveBeenCalled();
    expect(preview.template.background_url).toBe("/assets/card-backgrounds/bg-light-wave.webp");
  });

  it("rejects enterprise updates for fields locked by tenant settings", async () => {
    const originalDatabaseUrl = process.env.DATABASE_URL;
    process.env.DATABASE_URL = "postgres://test";
    const fakeTx = {
      query: async (text: string) => {
        if (text.includes("member_identities.id AS member_id")) {
          return {
            rows: [
              {
                member_id: "member-001",
                member_name: "Ada",
                member_status: "active",
                card_id: "card-001",
                public_id: "pub_001",
                display_name: "Ada",
                title: "Sales",
                avatar_url: null,
                fields_encrypted: null,
                privacy_json: null,
                card_status: "active"
              }
            ]
          };
        }
        if (text.includes("tenant_field_settings")) {
          return {
            rows: [
              {
                fields_json: [
                  { field_key: "avatar_url", label: "头像", locked: true, employee_editable: false, default_visible: true },
                  { field_key: "display_name", label: "姓名", locked: false, employee_editable: true, default_visible: true }
                ]
              }
            ]
          };
        }
        return { rows: [] };
      }
    };
    const tenantTx = {
      run: async (_tenantId: string, callback: (tx: typeof fakeTx) => Promise<unknown>) => callback(fakeTx)
    };
    try {
      const repository = new EmployeeCardRepository(tenantTx as never);
      await expect(
        repository.updateCurrentCard(
          {
            accountId: "acct-001",
            identityType: "wecom_member",
            tenantId: "tenant-001",
            memberIdentityId: "member-001",
            openUserid: "ou-001"
          },
          { avatar_url: "https://example.com/avatar.jpg" }
        )
      ).rejects.toThrow("field not employee editable: avatar_url");
    } finally {
      if (originalDatabaseUrl) {
        process.env.DATABASE_URL = originalDatabaseUrl;
      } else {
        delete process.env.DATABASE_URL;
      }
    }
  });

  it("rejects enterprise privacy changes disabled by WeCom tenant settings", async () => {
    const originalDatabaseUrl = process.env.DATABASE_URL;
    process.env.DATABASE_URL = "postgres://test";
    const fakeTx = {
      query: async (text: string) => {
        if (text.includes("member_identities.id AS member_id")) {
          return {
            rows: [
              {
                member_id: "member-001",
                member_name: "Ada",
                member_status: "active",
                card_id: "card-001",
                public_id: "pub_001",
                display_name: "Ada",
                title: "Sales",
                avatar_url: null,
                fields_encrypted: null,
                privacy_json: { show_mobile: false, show_email: true, show_wechat: false, allow_forward: true },
                card_status: "active"
              }
            ]
          };
        }
        if (text.includes("tenant_field_settings")) {
          return { rows: [] };
        }
        if (text.includes("tenant_wecom_settings")) {
          return {
            rows: [
              {
                allow_employee_privacy_edit: false,
                allow_employee_share_edit: false,
                allow_employee_wecom_qrcode_upload: true,
                qrcode_source: "enterprise_first"
              }
            ]
          };
        }
        return { rows: [] };
      }
    };
    const tenantTx = {
      run: async (_tenantId: string, callback: (tx: typeof fakeTx) => Promise<unknown>) => callback(fakeTx)
    };
    try {
      const repository = new EmployeeCardRepository(tenantTx as never);
      await expect(
        repository.updateCurrentCard(
          {
            accountId: "acct-001",
            identityType: "wecom_member",
            tenantId: "tenant-001",
            memberIdentityId: "member-001",
            openUserid: "ou-001"
          },
          { privacy: { show_mobile: true, allow_forward: false } }
        )
      ).rejects.toThrow("privacy setting not employee editable: show_mobile, allow_forward");
    } finally {
      if (originalDatabaseUrl) {
        process.env.DATABASE_URL = originalDatabaseUrl;
      } else {
        delete process.env.DATABASE_URL;
      }
    }
  });

  it("aggregates per-identity visit stats through the tenant transaction", async () => {
    const originalDatabaseUrl = process.env.DATABASE_URL;
    process.env.DATABASE_URL = "postgres://test";
    const queries: Array<{ text: string; values: unknown[] }> = [];
    const lastVisit = new Date("2026-07-11T08:00:00.000Z");
    const fakeTx = {
      query: async (text: string, values: unknown[] = []) => {
        queries.push({ text, values });
        if (text.includes("GROUP BY")) {
          return {
            rows: [
              {
                visitor_key: "anonymous",
                visitor_label: null,
                visitor_avatar_url: null,
                visitor_count: "2",
                visit_count: "3",
                is_anonymous: true,
                card_id: "card-001",
                public_id: "pub_owner001",
                card_name: "Owner Name",
                trust_level: "anonymous_client",
                channel: "share",
                last_visit_at: lastVisit
              },
              {
                visitor_key: "visitor-001",
                visitor_label: "微信用户",
                visitor_avatar_url: "https://example.com/avatar.png",
                visitor_count: "1",
                visit_count: "2",
                is_anonymous: false,
                card_id: "card-001",
                public_id: "pub_owner001",
                card_name: "Owner Name",
                trust_level: "authenticated_user",
                channel: null,
                last_visit_at: lastVisit
              }
            ]
          };
        }
        return { rows: [{ visit_count: "5", visitor_count: "2" }] };
      }
    };
    const tenantTx = {
      run: async (tenantId: string, callback: (tx: typeof fakeTx) => Promise<unknown>) => {
        expect(tenantId).toBe("tenant-001");
        return callback(fakeTx);
      }
    };
    try {
      const repository = new EmployeeCardRepository(tenantTx as never);
      const stats = await repository.getCurrentCardStats({
        accountId: "acct-001",
        tenantId: "tenant-001",
        memberIdentityId: "member-001",
        openUserid: "ou-001"
      });
      expect(stats).toEqual({
        visitor_count: 2,
        visit_count: 5,
        recent_visitors: [
          {
            visitor_key: "anonymous",
            visitor_label: "匿名访客",
            visitor_count: 2,
            visit_count: 3,
            is_anonymous: true,
            card_id: "card-001",
            public_id: "pub_owner001",
            card_name: "Owner Name",
            visitor_avatar_url: null,
            trust_level: "anonymous_client",
            channel: "share",
            last_visit_at: lastVisit.toISOString()
          },
          {
            visitor_key: "visitor-001",
            visitor_label: "微信用户",
            visitor_count: 1,
            visit_count: 2,
            is_anonymous: false,
            card_id: "card-001",
            public_id: "pub_owner001",
            card_name: "Owner Name",
            visitor_avatar_url: "https://example.com/avatar.png",
            trust_level: "authenticated_user",
            channel: null,
            last_visit_at: lastVisit.toISOString()
          }
        ]
      });
      expect(queries.every((query) => query.values.join(",").includes("member-001"))).toBe(true);
    } finally {
      if (originalDatabaseUrl) {
        process.env.DATABASE_URL = originalDatabaseUrl;
      } else {
        delete process.env.DATABASE_URL;
      }
    }
  });
});
