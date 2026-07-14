import { companyDisplayModulesSchema, companyIntroBlockSchema, companyServiceItemSchema } from "./admin-config.js";

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
  });
  it("accepts controlled content and rejects HTML blocks and overlong text", () => {
    expect(companyIntroBlockSchema.safeParse({type:"paragraph",text:"介绍"}).success).toBe(true);
    expect(companyIntroBlockSchema.safeParse({type:"html",html:"<script>x</script>"}).success).toBe(false);
    expect(companyIntroBlockSchema.safeParse({type:"heading",text:"x".repeat(121)}).success).toBe(false);
  });
});
