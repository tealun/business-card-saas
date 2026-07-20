import { ForbiddenException, Injectable } from "@nestjs/common";
import { createHash } from "node:crypto";
import { randomToken } from "../common/id.js";
import type { AdminSession } from "../admin-auth/admin-session.js";
import { AdminSessionTokenService } from "../admin-auth/admin-session-token.service.js";
import { requireTenantAdminRole } from "../admin-auth/admin-rbac.js";
import type { EmployeeSession } from "../session/employee-session.js";
import { LocalEnterpriseRepository } from "./local-enterprise.repository.js";
import { AdminOperationLogService } from "../admin-operation-log/admin-operation-log.service.js";
import { WechatJoinQrService } from "./wechat-join-qr.service.js";
import { adminCapabilities } from "../admin-auth/admin-permissions.js";

@Injectable()
export class LocalEnterpriseService {
  constructor(private readonly repository: LocalEnterpriseRepository, private readonly adminTokens: AdminSessionTokenService, private readonly audit: AdminOperationLogService, private readonly joinQr:WechatJoinQrService) {}

  async create(session: EmployeeSession, name: string) {
    const created = await this.repository.createEnterprise(session, name);
    const adminSession: AdminSession = { tenantId: created.tenantId, tenantName: created.tenantName, memberIdentityId: created.memberId, openUserid: created.openUserid, role: "owner", accountType: "tenant" };
    return { tenant_id: created.tenantId, member_identity_id: created.memberId, admin_access_token: this.adminTokens.sign(adminSession), expires_in: this.adminTokens.expiresIn };
  }

  async createAdminSession(session: EmployeeSession, tenantId: string) {
    const admin = await this.repository.findLocalAdminForAccount(session.accountId, tenantId);
    if (!admin) throw new ForbiddenException("active local enterprise administrator required");
    const adminSession: AdminSession = { tenantId: admin.tenantId, tenantName: admin.tenantName, memberIdentityId: admin.memberId, openUserid: admin.openUserid, role: admin.role, accountType: "tenant" };
    return { tenant_id: admin.tenantId, admin_access_token: this.adminTokens.sign(adminSession), expires_in: this.adminTokens.expiresIn };
  }

  async createAdminScanChallenge(){
    const token=randomToken("adm",21);
    const expiresAt=new Date(Date.now()+5*60*1000);
    await this.repository.createAdminScanChallenge(this.hash(token),expiresAt);
    const qrCodeDataUrl=await this.joinQr.generateScene(token,"pages/admin-login/index").catch(()=>null);
    return {challenge_token:token,status:"pending",expires_at:expiresAt.toISOString(),qr_code_data_url:qrCodeDataUrl,miniprogram_path:`pages/admin-login/index?scene=${encodeURIComponent(token)}`};
  }

  async confirmAdminScan(session:EmployeeSession,token:string,tenantId?:string){
    const admins=await this.repository.listLocalAdminsForAccount(session.accountId);
    if(!admins.length) throw new ForbiddenException("当前微信账号不是本地企业管理员");
    if(!tenantId&&admins.length>1) return {requires_selection:true,tenants:admins.map(item=>({tenant_id:item.tenantId,tenant_name:item.tenantName,role:item.role}))};
    const selected=admins.find(item=>item.tenantId===(tenantId??admins[0]!.tenantId));
    if(!selected) throw new ForbiddenException("当前微信账号无权管理所选企业");
    await this.repository.approveAdminScanChallenge({tokenHash:this.hash(token),accountId:session.accountId,admin:selected});
    return {requires_selection:false,approved:true,tenant_id:selected.tenantId,tenant_name:selected.tenantName};
  }

  async pollAdminScanChallenge(token:string){
    if(!/^adm_[A-Za-z0-9_-]{28}$/.test(token)) throw new ForbiddenException("invalid login challenge");
    const result=await this.repository.consumeAdminScanChallenge(this.hash(token));
    if(result.status!=="approved") return {status:result.status};
    const adminSession:AdminSession={tenantId:result.tenantId,tenantName:result.tenantName,memberIdentityId:result.memberId,openUserid:result.openUserid,role:result.role,accountType:"tenant"};
    const capabilities=adminCapabilities(adminSession);
    return {status:"approved",access_token:this.adminTokens.sign(adminSession),token_type:"Bearer",expires_in:this.adminTokens.expiresIn,admin:{tenant_id:result.tenantId,tenant_name:result.tenantName,member_identity_id:result.memberId,open_userid:result.openUserid,role:result.role,account_type:"tenant",permissions:capabilities.permissions,menu_scopes:capabilities.menuScopes}};
  }

  async invite(session: AdminSession, displayName: string) {
    requireTenantAdminRole(session, "admin");
    const token = randomToken("member", 24);
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const result = await this.repository.createInvitation({ tenantId: session.tenantId, adminId: session.memberIdentityId, displayName, tokenHash: createHash("sha256").update(token).digest("hex"), expiresAt });
    await this.audit.record({ session, action: "local_member.invite", targetType: "member_identity", targetId: result.memberId, detail: { expires_at: expiresAt.toISOString() } });
    return { member_identity_id: result.memberId, invitation_token: token, expires_at: expiresAt.toISOString() };
  }

  accept(session: EmployeeSession, token: string) { return this.repository.acceptInvitation(session.accountId, token); }

  // 认领平台创建的空壳本地企业：普通微信账号消费认领码成为该企业首个 owner，返回后台会话。
  async claim(session: EmployeeSession, token: string, displayName: string) {
    const created = await this.repository.claimEnterprise({ accountId: session.accountId, rawToken: token, displayName });
    const adminSession: AdminSession = { tenantId: created.tenantId, tenantName: created.tenantName, memberIdentityId: created.memberId, openUserid: created.openUserid, role: "owner", accountType: "tenant" };
    return { tenant_id: created.tenantId, tenant_name: created.tenantName, member_identity_id: created.memberId, admin_access_token: this.adminTokens.sign(adminSession), expires_in: this.adminTokens.expiresIn };
  }

  async createJoinCode(session:AdminSession) { requireTenantAdminRole(session,"admin"); const token=randomToken("join",20); const expiresAt=new Date(Date.now()+30*24*60*60*1000); await this.repository.createJoinCode({tenantId:session.tenantId,tokenHash:createHash("sha256").update(token).digest("hex"),expiresAt}); const qrCodeDataUrl=await this.joinQr.generate(token).catch(()=>null); await this.audit.record({session,action:"local_join_code.rotate",targetType:"tenant",targetId:session.tenantId,detail:{expires_at:expiresAt.toISOString(),qr_generated:Boolean(qrCodeDataUrl)}}); return {join_token:token,join_path:`pages/enterprise-join/index?token=${encodeURIComponent(token)}`,qr_code_data_url:qrCodeDataUrl,expires_at:expiresAt.toISOString()}; }
  submitJoinRequest(session:EmployeeSession,token:string,displayName:string) { return this.repository.submitJoinRequest({accountId:session.accountId,rawToken:token,displayName}); }
  async listJoinRequests(session:AdminSession) { requireTenantAdminRole(session,"admin"); return {items:await this.repository.listJoinRequests(session.tenantId)}; }
  async reviewJoinRequest(session:AdminSession,requestId:string,decision:"approved"|"rejected") { requireTenantAdminRole(session,"admin"); const result=await this.repository.reviewJoinRequest({tenantId:session.tenantId,requestId,adminId:session.memberIdentityId,decision}); await this.audit.record({session,action:`local_join_request.${decision}`,targetType:"member_join_request",targetId:requestId,detail:{member_id:result.memberId}}); return result; }

  private hash(token:string){return createHash("sha256").update(token).digest("hex");}
}
