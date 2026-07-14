import { BadRequestException, ForbiddenException } from "@nestjs/common";
import type { AdminSession } from "../admin-auth/admin-session.js";
import { CompanyVideoFeatureService } from "./company-video-feature.service.js";

const platformSession = {tenantId:"1",tenantName:"平台",memberIdentityId:null,openUserid:"platform:root",role:"owner",accountType:"platform"} satisfies AdminSession;
const tenantOwner = {...platformSession,tenantId:"2",openUserid:"owner",accountType:"tenant"} satisfies AdminSession;

function createRepository() {
  const platform={enabled:true,defaultLimitBytes:524_288_000,updatedAt:new Date(0)};
  const tenant={tenantId:"2",tenantName:"企业",enabled:true,limitBytes:null,updatedAt:new Date(0)};
  return {
    getPlatform: jest.fn(async()=>platform), updatePlatform:jest.fn(async(input)=>({...platform,enabled:input.enabled,defaultLimitBytes:input.default_limit_bytes})),
    getTenant:jest.fn(async(id)=>id==="2"?tenant:null), listTenants:jest.fn(async()=>({items:[tenant],total:1})),
    updateTenant:jest.fn(async(_id,_name,input)=>({...tenant,enabled:input.enabled,limitBytes:input.limit_bytes}))
  };
}

describe("CompanyVideoFeatureService",()=>{
  it("rejects tenant owners from platform settings",async()=>{const service=new CompanyVideoFeatureService(createRepository() as never); await expect(service.getPlatform(tenantOwner)).rejects.toBeInstanceOf(ForbiddenException);});
  it("returns inherited 500 MB capability",async()=>{const service=new CompanyVideoFeatureService(createRepository() as never); await expect(service.capability("2")).resolves.toMatchObject({enabled:true,effective_limit_bytes:524_288_000,source:"platform_default"});});
  it("applies a 300 MB tenant override",async()=>{const service=new CompanyVideoFeatureService(createRepository() as never); await expect(service.updateTenant(platformSession,"2",{enabled:true,limit_bytes:314_572_800})).resolves.toMatchObject({effective_limit_bytes:314_572_800,source:"tenant_override"});});
  it("rejects tenant limits above the platform limit",async()=>{const service=new CompanyVideoFeatureService(createRepository() as never); await expect(service.updateTenant(platformSession,"2",{enabled:true,limit_bytes:600_000_000})).rejects.toBeInstanceOf(BadRequestException);});
  it("platform off disables every tenant",async()=>{const repo=createRepository(); repo.getPlatform.mockResolvedValue({...await repo.getPlatform(),enabled:false}); const service=new CompanyVideoFeatureService(repo as never); await expect(service.capability("2")).resolves.toMatchObject({enabled:false});});
});
