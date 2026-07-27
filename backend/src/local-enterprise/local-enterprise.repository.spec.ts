import { ConflictException } from "@nestjs/common";
import { LocalEnterpriseRepository } from "./local-enterprise.repository.js";

class FakeDatabase {
  readonly sql:string[]=[];
  existingBinding=false;
  localAdminCandidates=false;
  claimTokenRow:{tenant_id:string;tenant_name:string}|null={tenant_id:"20",tenant_name:"本地企业"};
  claimedOwnerExists=false;
  async transaction<T>(callback:(tx:{query:FakeDatabase["query"]})=>Promise<T>){return callback({query:this.query.bind(this)});}
  async query<T>(text:string,_values?:unknown[]):Promise<{rows:T[]}>{
    this.sql.push(text.replace(/\s+/g," ").trim());
    if(text.includes("INSERT INTO member_identities")) return {rows:[{id:"31"} as T]};
    if(text.includes("INSERT INTO cards")) return {rows:[{id:"41"} as T]};
    if(text.includes("FROM tenant_join_codes")) return {rows:[{tenant_id:"20"} as T]};
    if(text.includes("FROM admin_claim_tokens c")) return {rows:(this.claimTokenRow?[this.claimTokenRow as T]:[])};
    if(text.includes("FROM tenant_admins WHERE tenant_id=$1 AND role='owner'")) return {rows:(this.claimedOwnerExists?[{exists:1} as T]:[])};
    if(text.includes("FROM account_identity_bindings") && this.existingBinding) return {rows:[{exists:1} as T]};
    if(text.includes("FROM account_identity_bindings b JOIN tenants t") && this.localAdminCandidates) return {rows:[{tenant_id:"20",tenant_name:"本地企业",member_identity_id:"30"} as T]};
    if(text.includes("FROM tenant_admins a WHERE") && this.localAdminCandidates) return {rows:[{tenant_id:"20",tenant_name:"本地企业",member_identity_id:"30",open_userid:"account:10",role:"owner"} as T]};
    if(text.includes("INSERT INTO member_join_requests")) return {rows:[{id:"51"} as T]};
    return {rows:[]};
  }
}

describe("LocalEnterpriseRepository",()=>{
  it("keeps invited members and public cards disabled until acceptance",async()=>{
    const db=new FakeDatabase();
    const repository=new LocalEnterpriseRepository(db as never);
    await repository.createInvitation({tenantId:"20",adminId:"30",displayName:"李四",tokenHash:"a".repeat(64),expiresAt:new Date()});
    expect(db.sql.find(sql=>sql.includes("INSERT INTO member_identities"))).toContain("'pending_invitation'");
    expect(db.sql.find(sql=>sql.includes("INSERT INTO cards"))).toContain("$6");
    expect(db.sql.find(sql=>sql.includes("INSERT INTO public_card_directory"))).toContain("$4");
  });

  it("rejects a join request when the account already belongs to the enterprise",async()=>{
    const db=new FakeDatabase();db.existingBinding=true;
    const repository=new LocalEnterpriseRepository(db as never);
    await expect(repository.submitJoinRequest({accountId:"10",rawToken:"join_token",displayName:"王五"})).rejects.toBeInstanceOf(ConflictException);
    expect(db.sql.some(sql=>sql.includes("INSERT INTO member_join_requests"))).toBe(false);
  });

  it("rotates join codes inside one transaction and serializes concurrent rotations",async()=>{
    const db=new FakeDatabase();
    const repository=new LocalEnterpriseRepository(db as never);
    await repository.createJoinCode({tenantId:"20",tokenHash:"b".repeat(64),expiresAt:new Date()});
    expect(db.sql[0]).toContain("pg_advisory_xact_lock");
    expect(db.sql[1]).toContain("UPDATE tenant_join_codes");
    expect(db.sql[2]).toContain("INSERT INTO tenant_join_codes");
  });

  it("resolves the claim token before setting any RLS tenant context (99_74-P0-1 regression guard)",async()=>{
    // admin_claim_tokens has RLS DISABLED precisely because this lookup must resolve the
    // tenant from an opaque token hash before app.tenant_id can be set. If a future change
    // reintroduces RLS on this table, or reorders the lookup after set_config, this either
    // throws here or (against a real database) breaks every claim silently — see database/rls.sql.
    const db=new FakeDatabase();
    const repository=new LocalEnterpriseRepository(db as never);
    await repository.claimEnterprise({accountId:"10",rawToken:"admclaim_token",displayName:"企业管理员"});
    const tokenLookupIndex=db.sql.findIndex(sql=>sql.includes("FROM admin_claim_tokens c"));
    const contextSetIndex=db.sql.findIndex(sql=>sql.includes("set_config('app.tenant_id'"));
    expect(tokenLookupIndex).toBe(0);
    expect(contextSetIndex).toBeGreaterThan(tokenLookupIndex);
    expect(db.sql.slice(0,tokenLookupIndex).some(sql=>sql.includes("set_config"))).toBe(false);
  });

  it("claims a platform-created empty local enterprise and returns an owner admin session",async()=>{
    const db=new FakeDatabase();
    const repository=new LocalEnterpriseRepository(db as never);
    const result=await repository.claimEnterprise({accountId:"10",rawToken:"admclaim_token",displayName:"企业管理员"});
    expect(result).toEqual({tenantId:"20",memberId:"31",tenantName:"本地企业",openUserid:"account:10"});
    expect(db.sql.some(sql=>sql.includes("INSERT INTO tenant_admins") && sql.includes("'claim_token'"))).toBe(true);
    expect(db.sql.some(sql=>sql.includes("UPDATE admin_claim_tokens SET used_at=now()"))).toBe(true);
  });

  it("rejects claiming an enterprise that already has an active owner",async()=>{
    const db=new FakeDatabase();db.claimedOwnerExists=true;
    const repository=new LocalEnterpriseRepository(db as never);
    await expect(repository.claimEnterprise({accountId:"10",rawToken:"admclaim_token",displayName:"企业管理员"})).rejects.toBeInstanceOf(ConflictException);
  });

  it("rejects claiming with an invalid or expired claim token",async()=>{
    const db=new FakeDatabase();db.claimTokenRow=null;
    const repository=new LocalEnterpriseRepository(db as never);
    await expect(repository.claimEnterprise({accountId:"10",rawToken:"bad_token",displayName:"企业管理员"})).rejects.toBeInstanceOf(ConflictException);
  });

  it("sets account and tenant RLS context while listing local administrators",async()=>{
    const db=new FakeDatabase();db.localAdminCandidates=true;
    const repository=new LocalEnterpriseRepository(db as never);
    await expect(repository.listLocalAdminsForAccount("10")).resolves.toEqual([{
      tenantId:"20",tenantName:"本地企业",memberId:"30",openUserid:"account:10",role:"owner"
    }]);
    expect(db.sql[0]).toContain("set_config('app.account_id'");
    expect(db.sql[1]).toContain("FROM account_identity_bindings b JOIN tenants t");
    expect(db.sql[2]).toContain("set_config('app.tenant_id'");
    expect(db.sql[3]).toContain("FROM tenant_admins a WHERE");
  });
});
