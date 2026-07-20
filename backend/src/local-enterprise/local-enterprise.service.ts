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

  async invite(session: AdminSession, displayName: string) {
    requireTenantAdminRole(session, "admin");
    const token = randomToken("member", 24);
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const result = await this.repository.createInvitation({ tenantId: session.tenantId, adminId: session.memberIdentityId, displayName, tokenHash: createHash("sha256").update(token).digest("hex"), expiresAt });
    await this.audit.record({ session, action: "local_member.invite", targetType: "member_identity", targetId: result.memberId, detail: { expires_at: expiresAt.toISOString() } });
    return { member_identity_id: result.memberId, invitation_token: token, expires_at: expiresAt.toISOString() };
  }

  accept(session: EmployeeSession, token: string) { return this.repository.acceptInvitation(session.accountId, token); }

  async createJoinCode(session:AdminSession) { requireTenantAdminRole(session,"admin"); const token=randomToken("join",20); const expiresAt=new Date(Date.now()+30*24*60*60*1000); await this.repository.createJoinCode({tenantId:session.tenantId,tokenHash:createHash("sha256").update(token).digest("hex"),expiresAt}); const qrCodeDataUrl=await this.joinQr.generate(token).catch(()=>null); await this.audit.record({session,action:"local_join_code.rotate",targetType:"tenant",targetId:session.tenantId,detail:{expires_at:expiresAt.toISOString(),qr_generated:Boolean(qrCodeDataUrl)}}); return {join_token:token,join_path:`pages/enterprise-join/index?token=${encodeURIComponent(token)}`,qr_code_data_url:qrCodeDataUrl,expires_at:expiresAt.toISOString()}; }
  submitJoinRequest(session:EmployeeSession,token:string,displayName:string) { return this.repository.submitJoinRequest({accountId:session.accountId,rawToken:token,displayName}); }
  async listJoinRequests(session:AdminSession) { requireTenantAdminRole(session,"admin"); return {items:await this.repository.listJoinRequests(session.tenantId)}; }
  async reviewJoinRequest(session:AdminSession,requestId:string,decision:"approved"|"rejected") { requireTenantAdminRole(session,"admin"); const result=await this.repository.reviewJoinRequest({tenantId:session.tenantId,requestId,adminId:session.memberIdentityId,decision}); await this.audit.record({session,action:`local_join_request.${decision}`,targetType:"member_join_request",targetId:requestId,detail:{member_id:result.memberId}}); return result; }
}
