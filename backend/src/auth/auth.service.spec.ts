import { AuthService } from "./auth.service.js";

describe("AuthService identity refresh",()=>{
  it("returns the account preference selected by a newly approved enterprise",async()=>{
    const oldIdentity={accountId:"10",identityType:"personal",tenantId:"1",tenantName:"个人名片",memberIdentityId:"11",displayName:"张三",openUserid:"wx:1",publicId:"pub_old"} as const;
    const newIdentity={...oldIdentity,identityType:"local_enterprise" as const,tenantId:"2",tenantName:"新企业",memberIdentityId:"22",publicId:"pub_new"};
    const repository={toSummary:jest.fn((identity)=>({member_identity_id:identity.memberIdentityId,tenant_id:identity.tenantId}))};
    const personalIdentities={preferredAccountIdentity:jest.fn(async()=>({current:newIdentity,identities:[oldIdentity,newIdentity]}))};
    const service=new AuthService(repository as never,{} as never,{} as never,personalIdentities as never);

    await expect(service.listIdentities(oldIdentity)).resolves.toEqual({
      current_identity:{member_identity_id:"22",tenant_id:"2"},
      identities:[{member_identity_id:"11",tenant_id:"1"},{member_identity_id:"22",tenant_id:"2"}]
    });
    expect(personalIdentities.preferredAccountIdentity).toHaveBeenCalledWith("10","11");
  });
});
