import { ForbiddenException } from "@nestjs/common";
import type { AdminSession } from "../admin-auth/admin-session.js";
import { updateAdminFieldSettingsRequestSchema } from "../contracts/admin-config.js";
import { AdminConfigRepository } from "./admin-config.repository.js";
import { AdminConfigService } from "./admin-config.service.js";

describe("AdminConfigService", () => {
  it("returns default field settings, company profile, and templates", () => {
    const service = createService();

    expect(service.getFieldSettings(adminSession()).fields.length).toBeGreaterThan(0);
    expect(service.getCompanyProfile(adminSession()).display_name).toBe("Pilot Corp");
    expect(service.listTemplates(adminSession()).items[0]?.is_default).toBe(true);
  });

  it("updates field settings and company profile for admins", () => {
    const service = createService();
    const fields = service.updateFieldSettings(adminSession(), {
      fields: [
        { field_key: "display_name", label: "姓名", locked: true, employee_editable: false, default_visible: true }
      ]
    });
    const profile = service.updateCompanyProfile(adminSession(), {
      display_name: "Pilot Corp Updated",
      website_url: "https://example.com"
    });

    expect(fields.fields[0]?.locked).toBe(true);
    expect(profile.display_name).toBe("Pilot Corp Updated");
    expect(profile.website_url).toBe("https://example.com");
  });

  it("creates, updates, and marks tenant templates as default", () => {
    const service = createService();
    const created = service.createTemplate(adminSession(), {
      name: "Blue Team",
      color_scheme: { primary: "#0052cc" }
    });
    const updated = service.updateTemplate(adminSession(), created.template_id, {
      name: "Blue Team v2"
    });
    const defaultTemplate = service.setDefaultTemplate(adminSession(), created.template_id);
    const templates = service.listTemplates(adminSession()).items;

    expect(updated.name).toBe("Blue Team v2");
    expect(defaultTemplate.is_default).toBe(true);
    expect(templates.filter((template) => template.is_default)).toHaveLength(1);
  });

  it("rejects config writes from auditors", () => {
    const service = createService();
    const auditor = { ...adminSession(), role: "auditor" as const };

    expect(() => service.updateCompanyProfile(auditor, { display_name: "Nope" })).toThrow(ForbiddenException);
    expect(() => service.createTemplate(auditor, { name: "Nope" })).toThrow(ForbiddenException);
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

function adminSession(): AdminSession {
  return {
    tenantId: "tenant-001",
    tenantName: "Pilot Corp",
    memberIdentityId: "member-001",
    openUserid: "ou-owner",
    role: "admin"
  };
}
