import { LocalEnterpriseService } from "./local-enterprise.service.js";

const employee = { accountId:"10", tenantId:"1", memberIdentityId:"1", openUserid:"wx:1", displayName:"张三" };
const owner = { tenantId:"20", tenantName:"本地企业", memberIdentityId:"30", openUserid:"account:10", role:"owner", accountType:"tenant" } as const;

describe("LocalEnterpriseService", () => {
  it("creates a local enterprise and returns an owner admin session", async () => {
    const repository={ createEnterprise:jest.fn(async()=>({tenantId:"20",memberId:"30",tenantName:"本地企业",openUserid:"account:10"})) };
    const tokens={ expiresIn:28800, sign:jest.fn(()=>"admin-token") };
    const service=new LocalEnterpriseService(repository as never,tokens as never);
    await expect(service.create(employee,"本地企业")).resolves.toEqual({tenant_id:"20",member_identity_id:"30",admin_access_token:"admin-token",expires_in:28800});
    expect(tokens.sign).toHaveBeenCalledWith(expect.objectContaining({tenantId:"20",role:"owner",accountType:"tenant"}));
  });

  it("creates a one-time member invitation for tenant admins", async () => {
    const repository={ createInvitation:jest.fn(async()=>({memberId:"31"})) };
    const service=new LocalEnterpriseService(repository as never,{} as never);
    const result=await service.invite(owner,"李四");
    expect(result.invitation_token).toMatch(/^member_/);
    expect(result.member_identity_id).toBe("31");
    expect(repository.createInvitation).toHaveBeenCalledWith(expect.objectContaining({tenantId:"20",displayName:"李四",tokenHash:expect.stringMatching(/^[a-f0-9]{64}$/)}));
  });

  it("accepts an invitation using the authenticated WeChat account only", async () => {
    const repository={ acceptInvitation:jest.fn(async()=>({tenantId:"20",memberId:"31",displayName:"李四"})) };
    const service=new LocalEnterpriseService(repository as never,{} as never);
    await service.accept(employee,"member_token");
    expect(repository.acceptInvitation).toHaveBeenCalledWith("10","member_token");
  });

  it("creates a shared join code but requires admin approval before binding", async () => {
    const repository={createJoinCode:jest.fn(),submitJoinRequest:jest.fn(async()=>({requestId:"9",tenantId:"20"})),reviewJoinRequest:jest.fn(async()=>({status:"approved",memberId:"32"}))};
    const service=new LocalEnterpriseService(repository as never,{} as never);
    const code=await service.createJoinCode(owner);
    expect(code.join_token).toMatch(/^join_/);
    await expect(service.submitJoinRequest(employee,code.join_token,"王五")).resolves.toEqual({requestId:"9",tenantId:"20"});
    await expect(service.reviewJoinRequest(owner,"9","approved")).resolves.toEqual({status:"approved",memberId:"32"});
    expect(repository.reviewJoinRequest).toHaveBeenCalledWith(expect.objectContaining({tenantId:"20",requestId:"9",decision:"approved"}));
  });
});
