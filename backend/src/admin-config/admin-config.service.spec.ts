import { ForbiddenException } from "@nestjs/common";
import type { AdminSession } from "../admin-auth/admin-session.js";
import { updateAdminFieldSettingsRequestSchema } from "../contracts/admin-config.js";
import type { TenantTransactionClient, TenantTx } from "../database/tenant-tx.service.js";
import { AdminConfigRepository } from "./admin-config.repository.js";
import { AdminConfigService } from "./admin-config.service.js";

describe("AdminConfigService", () => {
  // A71-P1-3: requireTenantAdminRole is called at every entry point of this service, but until
  // now no test asserted a platform-scoped token is actually rejected by any of them.
  it("rejects a platform-scoped session from every tenant entry point", async () => {
    const service = createService();
    const session = platformSession();

    await expect(service.getFieldSettings(session)).rejects.toThrow(ForbiddenException);
    await expect(service.updateFieldSettings(session, { fields: [] })).rejects.toThrow(ForbiddenException);
    await expect(service.getCompanyProfile(session)).rejects.toThrow(ForbiddenException);
    await expect(service.updateCompanyProfile(session, {})).rejects.toThrow(ForbiddenException);
    await expect(service.listCompanyHonors(session)).rejects.toThrow(ForbiddenException);
    await expect(service.createCompanyHonor(session, { title: "x" })).rejects.toThrow(ForbiddenException);
    await expect(service.listTemplates(session)).rejects.toThrow(ForbiddenException);
    await expect(service.createTemplate(session, { name: "x" })).rejects.toThrow(ForbiddenException);
  });

  it("returns default field settings, company profile, and templates", async () => {
    const service = createService();

    expect((await service.getFieldSettings(adminSession())).fields.length).toBeGreaterThan(0);
    expect((await service.getCompanyProfile(adminSession())).display_name).toBe("Pilot Corp");
    expect((await service.listTemplates(adminSession())).items[0]?.is_default).toBe(true);
  });

  it("updates field settings and company profile for admins", async () => {
    const service = createService();
    const fields = await service.updateFieldSettings(adminSession(), {
      fields: [
        { field_key: "display_name", label: "姓名", locked: true, employee_editable: false, default_visible: true }
      ]
    });
    const profile = await service.updateCompanyProfile(adminSession(), {
      display_name: "Pilot Corp Updated",
      website_url: "https://example.com"
    });

    expect(fields.fields.find((field) => field.field_key === "display_name")?.locked).toBe(true);
    expect(fields.fields.find((field) => field.field_key === "website")?.employee_editable).toBe(true);
    expect(profile.display_name).toBe("Pilot Corp Updated");
    expect(profile.website_url).toBe("https://example.com");
  });

  it("creates, updates, and marks tenant templates as default", async () => {
    const service = createService();
    const created = await service.createTemplate(adminSession(), {
      name: "Blue Team",
      color_scheme: { primary: "#0052cc" }
    });
    const updated = await service.updateTemplate(adminSession(), created.template_id, {
      name: "Blue Team v2"
    });
    const defaultTemplate = await service.setDefaultTemplate(adminSession(), created.template_id);
    const templates = (await service.listTemplates(adminSession())).items;

    expect(updated.name).toBe("Blue Team v2");
    expect(defaultTemplate.is_default).toBe(true);
    expect(templates.filter((template) => template.is_default)).toHaveLength(1);
  });

  it("records an operation log after setting a default template", async () => {
    const operationLogs = { record: jest.fn().mockResolvedValue(undefined) };
    const service = createService(operationLogs);
    const created = await service.createTemplate(adminSession(), { name: "Blue Team" });

    await service.setDefaultTemplate(adminSession(), created.template_id);

    expect(operationLogs.record).toHaveBeenLastCalledWith({
      session: adminSession(),
      action: "template.set_default",
      targetType: "template",
      targetId: created.template_id
    });
  });

  it("distinguishes profile publish from update in the operation log", async () => {
    const operationLogs = { record: jest.fn().mockResolvedValue(undefined) };
    const service = createService(operationLogs);

    await service.updateCompanyProfile(adminSession(), { display_name: "Pilot Corp Updated" });
    await service.updateCompanyProfile(adminSession(), { status: "published" });

    expect(operationLogs.record.mock.calls.map((call) => (call[0] as { action: string }).action)).toEqual([
      "company.profile.update",
      "company.profile.publish"
    ]);
  });

  it("creates and updates company honors with ordered images", async () => {
    const service = createService();
    const created = await service.createCompanyHonor(adminSession(), {
      title: "ISO 认证",
      body: "质量管理体系",
      images: [
        { image_url: "https://example.com/iso-a.jpg", title: "证书 A", caption: null, sort_order: 20 },
        { image_url: "https://example.com/iso-b.jpg", title: "证书 B", caption: "副本", sort_order: 10 }
      ]
    });
    const updated = await service.updateCompanyHonor(adminSession(), created.honor_id, {
      status: "published",
      visible: true,
      images: [{ image_url: "https://example.com/iso-published.jpg", title: null, caption: null, sort_order: 10 }]
    });
    const list = await service.listCompanyHonors(adminSession());

    expect(updated.status).toBe("published");
    expect(updated.images).toHaveLength(1);
    expect(list.items[0]?.title).toBe("ISO 认证");
  });

  it("deletes company honors from the tenant list", async () => {
    const service = createService();
    const created = await service.createCompanyHonor(adminSession(), {
      title: "待删除荣誉",
      status: "published",
      visible: true
    });

    await service.deleteCompanyHonor(adminSession(), created.honor_id);

    await expect(service.listCompanyHonors(adminSession())).resolves.toMatchObject({ items: [] });
  });

  it("normalizes legacy persisted company profile JSON before response validation", async () => {
    const originalDatabaseUrl = process.env.DATABASE_URL;
    process.env.DATABASE_URL = "postgres://unit-test";

    try {
      const service = new AdminConfigService(new AdminConfigRepository(fakeLegacyProfileTx()));

      const profile = await service.getCompanyProfile(adminSession());

      expect(profile.service_items).toMatchObject([
        { id: "service_legacy_0", title: "旧服务", image_url: null, visible: true }
      ]);
      expect(profile.display_modules.map((module) => module.key)).toEqual(["services", "profile", "videos", "honors"]);
    } finally {
      if (originalDatabaseUrl === undefined) {
        delete process.env.DATABASE_URL;
      } else {
        process.env.DATABASE_URL = originalDatabaseUrl;
      }
    }
  });

  it("marks the first persisted database template as default", async () => {
    const originalDatabaseUrl = process.env.DATABASE_URL;
    process.env.DATABASE_URL = "postgres://unit-test";

    try {
      const service = new AdminConfigService(new AdminConfigRepository(fakeTenantTx()));

      const created = await service.createTemplate(adminSession(), {
        name: "Persisted Template",
        color_scheme: { primary: "#0052cc" }
      });

      expect(created.template_id).toBe("101");
      expect(created.is_default).toBe(true);
      expect(created.color_scheme.primary).toBe("#0052cc");
    } finally {
      if (originalDatabaseUrl === undefined) {
        delete process.env.DATABASE_URL;
      } else {
        process.env.DATABASE_URL = originalDatabaseUrl;
      }
    }
  });

  it("seeds a persisted database default template when none exists", async () => {
    const originalDatabaseUrl = process.env.DATABASE_URL;
    process.env.DATABASE_URL = "postgres://unit-test";

    try {
      const service = new AdminConfigService(new AdminConfigRepository(fakeTenantTx()));

      const templates = await service.listTemplates(adminSession());

      expect(templates.items).toHaveLength(1);
      expect(templates.items[0]?.template_id).toBe("101");
      expect(templates.items[0]?.is_default).toBe(true);
    } finally {
      if (originalDatabaseUrl === undefined) {
        delete process.env.DATABASE_URL;
      } else {
        process.env.DATABASE_URL = originalDatabaseUrl;
      }
    }
  });

  it("rejects config writes from auditors", async () => {
    const service = createService();
    const auditor = { ...adminSession(), role: "auditor" as const };

    await expect(service.updateCompanyProfile(auditor, { display_name: "Nope" })).rejects.toThrow(
      ForbiddenException
    );
    await expect(service.createTemplate(auditor, { name: "Nope" })).rejects.toThrow(ForbiddenException);
  });

  it("rejects intro video blocks when the tenant has no video entitlement", async () => {
    const service = new AdminConfigService(new AdminConfigRepository(), {
      capability: async () => ({ enabled: false, effective_limit_bytes: 524288000, effective_limit_mb: 500, source: "platform_default" })
    } as never);

    await expect(service.updateCompanyProfile(adminSession(), {
      intro_blocks: [{ type: "video", video_id: "123" }]
    })).rejects.toThrow(ForbiddenException);
  });

  it("rejects intro video blocks that do not reference a published tenant video", async () => {
    const repository = new AdminConfigRepository();
    repository.publishedVideoExists = async () => false;
    const service = new AdminConfigService(repository, {
      capability: async () => ({ enabled: true, effective_limit_bytes: 524288000, effective_limit_mb: 500, source: "platform_default" })
    } as never);

    await expect(service.updateCompanyProfile(adminSession(), {
      intro_blocks: [{ type: "video", video_id: "123" }]
    })).rejects.toThrow(ForbiddenException);
  });

  it("rejects duplicate field rule keys", () => {
    expect(() =>
      updateAdminFieldSettingsRequestSchema.parse({
        fields: [
          { field_key: "email", label: "邮箱", locked: false, employee_editable: true, default_visible: true },
          { field_key: "email", label: "工作邮箱", locked: false, employee_editable: true, default_visible: true }
        ]
      })
    ).toThrow("field_key must be unique");
  });
});

function createService(operationLogs?: { record: jest.Mock }) {
  return new AdminConfigService(new AdminConfigRepository(), undefined, operationLogs as never);
}

function fakeTenantTx(): TenantTx {
  return {
    run: async <T>(
      _tenantId: bigint | number | string,
      callback: (tx: TenantTransactionClient) => Promise<T>
    ): Promise<T> => {
      const tx = {
        query: async (sql: string, params: unknown[] = []) => {
          if (sql.includes("count(*)")) {
            return { rows: [{ count: "0" }] };
          }
          if (sql.includes("FROM templates") && sql.includes("ORDER BY id ASC")) {
            return { rows: [] };
          }
          if (sql.includes("INSERT INTO templates")) {
            const seedsDefaultTemplate = sql.includes("VALUES ($1, $2, true");
            return {
              rows: [
                {
                  id: "101",
                  name: params[1],
                  is_default: seedsDefaultTemplate ? true : params[2],
                  background_url: seedsDefaultTemplate ? params[2] : params[3],
                  logo_url: seedsDefaultTemplate ? params[3] : params[4],
                  color_scheme_json: seedsDefaultTemplate ? params[4] : params[5],
                  layout_json: seedsDefaultTemplate ? params[5] : params[6],
                  status: "active"
                }
              ]
            };
          }
          throw new Error(`unexpected query: ${sql}`);
        }
      } as unknown as TenantTransactionClient;
      return callback(tx);
    }
  } as unknown as TenantTx;
}

function fakeLegacyProfileTx(): TenantTx {
  return {
    run: async <T>(
      _tenantId: bigint | number | string,
      callback: (tx: TenantTransactionClient) => Promise<T>
    ): Promise<T> => {
      const tx = {
        query: async (sql: string) => {
          if (sql.includes("FROM company_profiles")) {
            return {
              rows: [
                {
                  tenant_id: "tenant-001",
                  display_name: "Pilot Corp",
                  short_name: null,
                  logo_url: null,
                  website_url: null,
                  address: null,
                  intro_json: [],
                  service_items_json: [
                    { title: "旧服务", description: "旧描述", image_url: "not-a-url", sort_order: 30 }
                  ],
                  display_modules_json: [{ key: "services", title: "服务", visible: true, layout: "graphic" }],
                  visible: true,
                  status: "published"
                }
              ]
            };
          }
          throw new Error(`unexpected query: ${sql}`);
        }
      } as unknown as TenantTransactionClient;
      return callback(tx);
    }
  } as unknown as TenantTx;
}

function adminSession(): AdminSession {
  return {
    tenantId: "tenant-001",
    tenantName: "Pilot Corp",
    memberIdentityId: "member-001",
    openUserid: "ou-owner",
    role: "admin"
  };
}

function platformSession(): AdminSession {
  return {
    accountType: "platform",
    tenantId: "0",
    tenantName: "Platform",
    memberIdentityId: null,
    openUserid: "platform:root",
    role: "owner"
  };
}
