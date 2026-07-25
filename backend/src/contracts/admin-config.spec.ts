import {
  adminCompanyProfileSchema,
  createAdminTemplateRequestSchema,
  companyDisplayModulesSchema,
  companyIntroBlockSchema,
  companyServiceItemSchema,
  updateAdminCompanyProfileRequestSchema,
  updateAdminTemplateRequestSchema
} from "./admin-config.js";

const modules = [
  { key: "services", title: "产品与服务", visible: true, sort_order: 10, layout: "graphic" },
  { key: "profile", title: "企业简介", visible: true, sort_order: 20, layout: "carousel" },
  { key: "videos", title: "企业视频", visible: false, sort_order: 30, layout: "carousel" },
  { key: "honors", title: "荣誉资质", visible: true, sort_order: 40, layout: "carousel" }
] as const;

describe("company profile contracts", () => {
  it("accepts the complete unique module set", () => expect(companyDisplayModulesSchema.parse(modules)).toHaveLength(4));
  it("rejects missing and duplicate module keys", () => {
    expect(companyDisplayModulesSchema.safeParse(modules.slice(0, 3)).success).toBe(false);
    expect(companyDisplayModulesSchema.safeParse([...modules.slice(0, 3), modules[0]]).success).toBe(false);
  });
  it("rejects unsupported layouts", () => expect(companyDisplayModulesSchema.safeParse(modules.map((item, index) => index ? item : {...item,layout:"raw-html"})).success).toBe(false));
  it("requires a service title or image and validates image URLs", () => {
    expect(companyServiceItemSchema.safeParse({id:"service_one",title:"",description:"",image_url:null,visible:true,sort_order:0}).success).toBe(false);
    expect(companyServiceItemSchema.safeParse({id:"service_one",title:"服务",description:"",image_url:"javascript:x",visible:true,sort_order:0}).success).toBe(false);
    expect(companyServiceItemSchema.safeParse({id:"service_one",title:"",description:"",image_url:"/api/v1/storage/tenant/demo/company-images/a.png",visible:true,sort_order:0}).success).toBe(true);
  });
  it("accepts backend storage paths for company profile and template images", () => {
    const logoUrl = "/api/v1/storage/tenant/demo/logos/a.png";
    const backgroundUrl = "/api/v1/storage/tenant/demo/templates/bg.png";
    expect(updateAdminCompanyProfileRequestSchema.safeParse({ logo_url: logoUrl }).success).toBe(true);
    expect(adminCompanyProfileSchema.safeParse({
      tenant_id: "tenant_1",
      display_name: "Pilot Corp",
      short_name: null,
      logo_url: logoUrl,
      website_url: "https://example.com",
      address: null,
      intro_blocks: [],
      service_items: [],
      display_modules: modules,
      visible: true,
      status: "draft"
    }).success).toBe(true);
    expect(createAdminTemplateRequestSchema.safeParse({
      name: "Blue Team",
      logo_url: logoUrl,
      background_url: backgroundUrl
    }).success).toBe(true);
    expect(updateAdminTemplateRequestSchema.safeParse({
      logo_url: logoUrl,
      background_url: backgroundUrl
    }).success).toBe(true);
  });
  it("normalizes bare website URLs for company profile reads and writes", () => {
    expect(updateAdminCompanyProfileRequestSchema.parse({ website_url: "example.com" }).website_url).toBe("https://example.com");
    expect(adminCompanyProfileSchema.parse({
      tenant_id: "tenant_1",
      display_name: "Pilot Corp",
      short_name: null,
      logo_url: null,
      website_url: "example.com",
      address: null,
      intro_blocks: [],
      service_items: [],
      display_modules: modules,
      visible: true,
      status: "draft"
    }).website_url).toBe("https://example.com");
  });
  it("accepts controlled content and rejects HTML blocks and overlong text", () => {
    expect(companyIntroBlockSchema.safeParse({type:"paragraph",text:"介绍"}).success).toBe(true);
    expect(companyIntroBlockSchema.safeParse({type:"html",html:"<script>x</script>"}).success).toBe(false);
    expect(companyIntroBlockSchema.safeParse({type:"heading",text:"x".repeat(121)}).success).toBe(false);
  });
});
