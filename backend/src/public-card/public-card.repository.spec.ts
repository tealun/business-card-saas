import { demoPublicCard } from "../fixtures/demo-cards.js";
import { PublicCardRepository } from "./public-card.repository.js";

describe("PublicCardRepository", () => {
  it("returns isolated copies of modular company profile data", async () => {
    const repository = new PublicCardRepository();

    const first = await repository.findPublicCard("pub_demo0001");
    first.company_profile.intro_blocks[0] = { type: "heading", text: "Mutated intro" };
    first.company_profile.service_items[0] = {
      id: "service_mutated",
      title: "Mutated service",
      description: "",
      image_url: null,
      visible: true,
      sort_order: 0
    };
    first.company_profile.display_modules[0] = {
      key: "services",
      title: "Mutated module",
      visible: false,
      sort_order: 99,
      layout: "text"
    };

    const second = await repository.findPublicCard("pub_demo0001");

    expect(second.company_profile.intro_blocks[0]).not.toEqual({ type: "heading", text: "Mutated intro" });
    expect(second.company_profile.service_items[0]?.title).toBe(demoPublicCard.company_profile.service_items[0]?.title);
    expect(second.company_profile.display_modules[0]?.title).toBe(demoPublicCard.company_profile.display_modules[0]?.title);
    expect(second.company_profile.display_modules[0]?.visible).toBe(true);
  });

  it("uses admin-maintained company profile fields over legacy card fields", async () => {
    const originalDatabaseUrl = process.env.DATABASE_URL;
    process.env.DATABASE_URL = "postgres://test";
    const database = {
      query: async () => ({
        rows: [{ tenant_id: "tenant-001", card_id: "card-001", status: "active" }]
      })
    };
    const fakeTx = {
      query: async (text: string) => {
        if (text.includes("FROM cards") && text.includes("company_profiles.display_name")) {
          return {
            rows: [
              {
                card_id: "card-001",
                member_identity_id: "member-001",
                public_id: "pub_001",
                display_name: "Ada",
                title: "Sales",
                avatar_url: null,
                fields_encrypted: JSON.stringify({
                  company: "Legacy Corp",
                  company_short_name: "Legacy",
                  address: "Legacy address",
                  mobile: "13800138000",
                  email: "ada@example.com",
                  paper_card_url: "/api/v1/storage/tenant/tenant-001/paper-cards/card.png"
                }),
                privacy_json: { show_mobile: true, show_email: true, show_wechat: false, show_paper_card: false, allow_forward: true },
                card_status: "active",
                company_profile_id: "profile-001",
                company_name: "Admin Corp",
                company_short_name: "Admin",
                company_logo_url: "/api/v1/storage/tenant/tenant-001/logos/enterprise.png",
                website_url: "https://admin.example.com",
                address: "Admin address",
                intro_json: [],
                service_items_json: [],
                display_modules_json: [],
                tenant_type: "enterprise",
                background_url: "/api/v1/storage/tenant/tenant-001/templates/stale.webp",
                color_scheme_json: { primary: "#ff0000" },
                layout_json: { __template_id: "tpl_dark", variant: "dark" },
                default_template_background_url: "/api/v1/storage/tenant/tenant-001/templates/company.webp",
                default_template_logo_url: "/api/v1/storage/system/logos/placeholder.png",
                default_template_color_scheme_json: { primary: "#0f766e", surface: "#ffffff" },
                default_template_layout_json: {
                  variant: "minimal",
                  background_preset_id: "light-geometry",
                  template_backgrounds: { minimal: { background_preset_id: "light-geometry" } }
                }
              }
            ]
          };
        }
        if (text.includes("COUNT(*)")) {
          return { rows: [{ visit_count: "0", visitor_count: "0", like_count: "0" }] };
        }
        return { rows: [] };
      }
    };
    const tenantTx = {
      run: async (_tenantId: string, callback: (tx: typeof fakeTx) => Promise<unknown>) => callback(fakeTx)
    };
    try {
      const repository = new PublicCardRepository(database as never, tenantTx as never);
      const card = await repository.findPublicCard("pub_001");

      expect(card.card.company).toBe("Admin Corp");
      expect(card.card.company_short_name).toBe("Admin");
      expect(card.card.fields.company).toBe("Admin Corp");
      expect(card.card.fields.company_short_name).toBe("Admin");
      expect(card.card.fields.address).toBe("Admin address");
      expect(card.card.fields.paper_card_url).toBeNull();
      expect(card.company_profile.name).toBe("Admin Corp");
      expect(card.company_profile.short_name).toBe("Admin");
      expect(card.company_profile.address).toBe("Admin address");
      expect(card.template).toMatchObject({
        template_id: "tpl_dark",
        logo_url: "/api/v1/storage/tenant/tenant-001/logos/enterprise.png",
        background_url: "/api/v1/storage/tenant/tenant-001/templates/company.webp",
        color_scheme: { primary: "#0f766e", surface: "#ffffff" },
        layout: {
          variant: "dark",
          background_preset_id: "light-geometry",
          template_backgrounds: { minimal: { background_preset_id: "light-geometry" } }
        }
      });
    } finally {
      if (originalDatabaseUrl) {
        process.env.DATABASE_URL = originalDatabaseUrl;
      } else {
        delete process.env.DATABASE_URL;
      }
    }
  });

  it.each([
    { name: "the company home is unpublished", companyProfileId: null, honorsVisible: true, expectedHonors: 0 },
    { name: "the honors module is hidden", companyProfileId: "profile-001", honorsVisible: false, expectedHonors: 0 },
    { name: "the company home and honors module are published", companyProfileId: "profile-001", honorsVisible: true, expectedHonors: 1 }
  ])("gates real honors when $name", async ({ companyProfileId, honorsVisible, expectedHonors }) => {
    const originalDatabaseUrl = process.env.DATABASE_URL;
    process.env.DATABASE_URL = "postgres://test";
    const database = {
      query: async () => ({ rows: [{ tenant_id: "tenant-001", card_id: "card-001", status: "active" }] })
    };
    const modules = [
      { key: "services", title: "产品与服务", visible: true, sort_order: 10, layout: "graphic" },
      { key: "profile", title: "企业简介", visible: true, sort_order: 20, layout: "carousel" },
      { key: "videos", title: "企业视频", visible: false, sort_order: 30, layout: "carousel" },
      { key: "honors", title: "荣誉资质", visible: honorsVisible, sort_order: 40, layout: "carousel" }
    ];
    let honorQueryCount = 0;
    let honorQuery = "";
    const fakeTx = {
      query: async (query: string) => {
        if (query.includes("FROM cards") && query.includes("company_profiles.display_name")) {
          return {
            rows: [{
              card_id: "card-001",
              member_identity_id: "member-001",
              public_id: "pub_001",
              display_name: "Ada",
              title: "Sales",
              avatar_url: null,
              fields_encrypted: "{}",
              privacy_json: {},
              card_status: "active",
              company_profile_id: companyProfileId,
              company_name: companyProfileId ? "Admin Corp" : null,
              company_short_name: null,
              company_logo_url: null,
              website_url: null,
              address: null,
              intro_json: [],
              service_items_json: [],
              display_modules_json: companyProfileId ? modules : null,
              tenant_type: "enterprise",
              background_url: null,
              color_scheme_json: {},
              layout_json: {},
              default_template_background_url: null,
              default_template_logo_url: null,
              default_template_color_scheme_json: {},
              default_template_layout_json: {}
            }]
          };
        }
        if (query.includes("FROM company_honors")) {
          honorQueryCount += 1;
          honorQuery = query;
          return {
            rows: [{
              id: "honor-001",
              title: "真实荣誉",
              body: "来自当前租户的已发布内容",
              image_url: "/api/v1/storage/tenant/tenant-001/honors/real.webp",
              image_title: null,
              image_caption: null
            }]
          };
        }
        if (query.includes("COUNT(*)")) return { rows: [{ visit_count: "0", visitor_count: "0", like_count: "0" }] };
        return { rows: [] };
      }
    };
    const tenantTx = {
      run: async (_tenantId: string, callback: (tx: typeof fakeTx) => Promise<unknown>) => callback(fakeTx)
    };
    try {
      const repository = new PublicCardRepository(database as never, tenantTx as never);
      const card = await repository.findPublicCard("pub_001");

      expect(card.honors).toHaveLength(expectedHonors);
      expect(honorQueryCount).toBe(expectedHonors ? 1 : 0);
      if (expectedHonors) {
        expect(card.honors[0]?.title).toBe("真实荣誉");
        expect(honorQuery).not.toContain("company_honors.status");
        expect(honorQuery).not.toContain("company_honors.visible");
      }
    } finally {
      if (originalDatabaseUrl) process.env.DATABASE_URL = originalDatabaseUrl;
      else delete process.env.DATABASE_URL;
    }
  });
});
