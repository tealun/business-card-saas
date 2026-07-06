import { ForbiddenException } from "@nestjs/common";
import type { AdminSession } from "../admin-auth/admin-session.js";
import { updateAdminFieldSettingsRequestSchema } from "../contracts/admin-config.js";
import type { TenantTransactionClient, TenantTx } from "../database/tenant-tx.service.js";
import { AdminConfigRepository } from "./admin-config.repository.js";
import { AdminConfigService } from "./admin-config.service.js";

describe("AdminConfigService", () => {
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

    expect(fields.fields[0]?.locked).toBe(true);
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

function createService() {
  return new AdminConfigService(new AdminConfigRepository());
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

function adminSession(): AdminSession {
  return {
    tenantId: "tenant-001",
    tenantName: "Pilot Corp",
    memberIdentityId: "member-001",
    openUserid: "ou-owner",
    role: "admin"
  };
}
