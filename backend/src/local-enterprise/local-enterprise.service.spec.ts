import { LocalEnterpriseService } from "./local-enterprise.service.js";

const employee = { accountId:"10", tenantId:"1", memberIdentityId:"1", openUserid:"wx:1", displayName:"张三" };
const owner = { tenantId:"20", tenantName:"本地企业", memberIdentityId:"30", openUserid:"account:10", role:"owner", accountType:"tenant" } as const;

describe("LocalEnterpriseService", () => {
  const audit={record:jest.fn(async()=>undefined)};
  const joinQr={generate:jest.fn(async()=>"data:image/png;base64,cXI="),generateScene:jest.fn(async()=>"data:image/png;base64,YWRtaW4=")};
  it("creates a local enterprise and returns an owner admin session", async () => {
    const repository={ createEnterprise:jest.fn(async()=>({tenantId:"20",memberId:"30",tenantName:"本地企业",openUserid:"account:10"})) };
    const tokens={ expiresIn:28800, sign:jest.fn(()=>"admin-token") };
    const service=new LocalEnterpriseService(repository as never,tokens as never,audit as never,joinQr as never);
    await expect(service.create(employee,"本地企业")).resolves.toEqual({tenant_id:"20",member_identity_id:"30",admin_access_token:"admin-token",expires_in:28800});
    expect(tokens.sign).toHaveBeenCalledWith(expect.objectContaining({tenantId:"20",role:"owner",accountType:"tenant"}));
  });

  it("creates a one-time member invitation for tenant admins", async () => {
    const repository={ createInvitation:jest.fn(async()=>({memberId:"31"})) };
    const service=new LocalEnterpriseService(repository as never,{} as never,audit as never,joinQr as never);
    const result=await service.invite(owner,"李四");
    expect(result.invitation_token).toMatch(/^member_/);
    expect(result.member_identity_id).toBe("31");
    expect(repository.createInvitation).toHaveBeenCalledWith(expect.objectContaining({tenantId:"20",displayName:"李四",tokenHash:expect.stringMatching(/^[a-f0-9]{64}$/)}));
  });

  it("accepts an invitation using the authenticated WeChat account only", async () => {
    const repository={ acceptInvitation:jest.fn(async()=>({tenantId:"20",memberId:"31",displayName:"李四"})) };
    const service=new LocalEnterpriseService(repository as never,{} as never,audit as never,joinQr as never);
    await service.accept(employee,"member_token");
    expect(repository.acceptInvitation).toHaveBeenCalledWith("10","member_token");
  });

  it("creates a shared join code but requires admin approval before binding", async () => {
    const repository={createJoinCode:jest.fn(),submitJoinRequest:jest.fn(async()=>({requestId:"9",tenantId:"20"})),reviewJoinRequest:jest.fn(async()=>({status:"approved",memberId:"32"}))};
    const service=new LocalEnterpriseService(repository as never,{} as never,audit as never,joinQr as never);
    const code=await service.createJoinCode(owner);
    expect(code.join_token).toMatch(/^join_/);
    expect(code.qr_code_data_url).toBe("data:image/png;base64,cXI=");
    await expect(service.submitJoinRequest(employee,code.join_token,"王五")).resolves.toEqual({requestId:"9",tenantId:"20"});
    await expect(service.reviewJoinRequest(owner,"9","approved")).resolves.toEqual({status:"approved",memberId:"32"});
    expect(repository.reviewJoinRequest).toHaveBeenCalledWith(expect.objectContaining({tenantId:"20",requestId:"9",decision:"approved"}));
  });

  it("reissues an admin token only for an active local admin bound to the account",async()=>{
    const repository={findLocalAdminForAccount:jest.fn(async()=>({tenantId:"20",tenantName:"本地企业",memberId:"30",openUserid:"account:10",role:"owner"}))};
    const tokens={expiresIn:28800,sign:jest.fn(()=>"new-admin-token")};
    const service=new LocalEnterpriseService(repository as never,tokens as never,audit as never,joinQr as never);
    await expect(service.createAdminSession(employee,"20")).resolves.toEqual({tenant_id:"20",admin_access_token:"new-admin-token",expires_in:28800});
    expect(repository.findLocalAdminForAccount).toHaveBeenCalledWith("10","20");
  });

  it("lists manageable local enterprises for any active tenant admin role",async()=>{
    const repository={listLocalAdminsForAccount:jest.fn(async()=>[
      {tenantId:"20",tenantName:"本地企业",memberId:"30",openUserid:"account:10",role:"admin"},
      {tenantId:"21",tenantName:"分公司",memberId:"31",openUserid:"account:10",role:"operator"}
    ])};
    const service=new LocalEnterpriseService(repository as never,{} as never,audit as never,joinQr as never);
    await expect(service.listAdminTenants(employee)).resolves.toEqual({items:[
      {tenant_id:"20",tenant_name:"本地企业",role:"admin"},
      {tenant_id:"21",tenant_name:"分公司",role:"operator"}
    ]});
    expect(repository.listLocalAdminsForAccount).toHaveBeenCalledWith("10");
  });

  it("creates and consumes a one-time local admin scan challenge",async()=>{
    const repository={
      createAdminScanChallenge:jest.fn(async()=>undefined),
      listLocalAdminsForAccount:jest.fn(async()=>[{tenantId:"20",tenantName:"本地企业",memberId:"30",openUserid:"account:10",role:"owner"}]),
      approveAdminScanChallenge:jest.fn(async()=>undefined),
      consumeAdminScanChallenge:jest.fn(async()=>({status:"approved",tenantId:"20",tenantName:"本地企业",memberId:"30",openUserid:"account:10",role:"owner"}))
    };
    const tokens={expiresIn:28800,sign:jest.fn(()=>"admin-token")};
    const service=new LocalEnterpriseService(repository as never,tokens as never,audit as never,joinQr as never);
    const challenge=await service.createAdminScanChallenge();
    expect(challenge.challenge_token).toHaveLength(32);
    await expect(service.confirmAdminScan(employee,challenge.challenge_token)).resolves.toEqual(expect.objectContaining({approved:true,tenant_id:"20"}));
    await expect(service.pollAdminScanChallenge(challenge.challenge_token)).resolves.toEqual(expect.objectContaining({status:"approved",access_token:"admin-token"}));
  });
});
