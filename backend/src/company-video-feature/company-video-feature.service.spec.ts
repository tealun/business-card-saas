import { BadRequestException, ForbiddenException } from "@nestjs/common";
import type { AdminSession } from "../admin-auth/admin-session.js";
import { CompanyVideoFeatureService } from "./company-video-feature.service.js";

const platformSession = {tenantId:"1",tenantName:"平台",memberIdentityId:null,openUserid:"platform:root",role:"owner",accountType:"platform"} satisfies AdminSession;
const tenantOwner = {...platformSession,tenantId:"2",openUserid:"owner",accountType:"tenant"} satisfies AdminSession;
const platformAuditor = {...platformSession,openUserid:"platform:audit",role:"auditor"} satisfies AdminSession;

function createRepository() {
  const platform={enabled:true,defaultLimitBytes:524_288_000,updatedAt:new Date(0)};
  const tenant={tenantId:"2",tenantName:"企业",hasOverride:true,enabled:true,limitBytes:null,updatedAt:new Date(0)};
  const unconfiguredTenant={tenantId:"3",tenantName:"未授权企业",hasOverride:false,enabled:false,limitBytes:null,updatedAt:null};
  return {
    getPlatform: jest.fn(async()=>platform), updatePlatform:jest.fn(async(input)=>({...platform,enabled:input.enabled,defaultLimitBytes:input.default_limit_bytes})),
    getTenant:jest.fn(async(id)=>id==="2"?tenant:id==="3"?unconfiguredTenant:null), listTenants:jest.fn(async(_search,_limit,_offset,options)=>({items:options?.onlyOverrides?[tenant]:[tenant,unconfiguredTenant],total:options?.onlyOverrides?1:2})),
    updateTenant:jest.fn(async(_id,_name,input)=>({...tenant,hasOverride:true,enabled:input.enabled,limitBytes:input.limit_bytes}))
  };
}

describe("CompanyVideoFeatureService",()=>{
  it("rejects tenant owners from platform settings",async()=>{const service=new CompanyVideoFeatureService(createRepository() as never); await expect(service.getPlatform(tenantOwner)).rejects.toBeInstanceOf(ForbiddenException);});
  it("rejects read-only platform admins from platform writes",async()=>{const service=new CompanyVideoFeatureService(createRepository() as never); await expect(service.updatePlatform(platformAuditor,{enabled:true,default_limit_bytes:524_288_000})).rejects.toThrow("admin role does not have permission"); await expect(service.updateTenant(platformAuditor,"2",{enabled:true,limit_bytes:null})).rejects.toThrow("admin role does not have permission");});
  it("returns a tenant override that inherits the 500 MB platform limit",async()=>{const service=new CompanyVideoFeatureService(createRepository() as never); await expect(service.capability("2")).resolves.toMatchObject({enabled:true,effective_limit_bytes:524_288_000,source:"tenant_override"});});
  it("returns platform default source for an unconfigured tenant",async()=>{const service=new CompanyVideoFeatureService(createRepository() as never); await expect(service.capability("3")).resolves.toMatchObject({enabled:false,effective_limit_bytes:524_288_000,source:"platform_default"});});
  it("applies a 300 MB tenant override",async()=>{const service=new CompanyVideoFeatureService(createRepository() as never); await expect(service.updateTenant(platformSession,"2",{enabled:true,limit_bytes:314_572_800})).resolves.toMatchObject({effective_limit_bytes:314_572_800,source:"tenant_override"});});
  it("rejects tenant limits above the platform limit",async()=>{const service=new CompanyVideoFeatureService(createRepository() as never); await expect(service.updateTenant(platformSession,"2",{enabled:true,limit_bytes:600_000_000})).rejects.toBeInstanceOf(BadRequestException);});
  it("platform off disables every tenant",async()=>{const repo=createRepository(); repo.getPlatform.mockResolvedValue({...await repo.getPlatform(),enabled:false}); const service=new CompanyVideoFeatureService(repo as never); await expect(service.capability("2")).resolves.toMatchObject({enabled:false});});
  it("lists only configured tenant overrides by default",async()=>{const repo=createRepository(); const service=new CompanyVideoFeatureService(repo as never); await expect(service.listTenants(platformSession,"",1,20,{onlyOverrides:true})).resolves.toMatchObject({total:1,items:[{tenant_id:"2",source:"tenant_override"}]}); expect(repo.listTenants).toHaveBeenCalledWith("",20,0,{onlyOverrides:true});});
  it("can search all tenants before granting a feature",async()=>{const service=new CompanyVideoFeatureService(createRepository() as never); await expect(service.listTenants(platformSession,"",1,20,{onlyOverrides:false})).resolves.toMatchObject({total:2,items:[{tenant_id:"2",source:"tenant_override"},{tenant_id:"3",source:"platform_default"}]});});
});
