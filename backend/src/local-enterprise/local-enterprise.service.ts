import { Injectable } from "@nestjs/common";
import { createHash } from "node:crypto";
import { randomToken } from "../common/id.js";
import type { AdminSession } from "../admin-auth/admin-session.js";
import { AdminSessionTokenService } from "../admin-auth/admin-session-token.service.js";
import { requireTenantAdminRole } from "../admin-auth/admin-rbac.js";
import type { EmployeeSession } from "../session/employee-session.js";
import { LocalEnterpriseRepository } from "./local-enterprise.repository.js";

@Injectable()
export class LocalEnterpriseService {
  constructor(private readonly repository: LocalEnterpriseRepository, private readonly adminTokens: AdminSessionTokenService) {}

  async create(session: EmployeeSession, name: string) {
    const created = await this.repository.createEnterprise(session, name);
    const adminSession: AdminSession = { tenantId: created.tenantId, tenantName: created.tenantName, memberIdentityId: created.memberId, openUserid: created.openUserid, role: "owner", accountType: "tenant" };
    return { tenant_id: created.tenantId, member_identity_id: created.memberId, admin_access_token: this.adminTokens.sign(adminSession), expires_in: this.adminTokens.expiresIn };
  }

  async invite(session: AdminSession, displayName: string) {
    requireTenantAdminRole(session, "admin");
    const token = randomToken("member", 24);
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const result = await this.repository.createInvitation({ tenantId: session.tenantId, adminId: session.memberIdentityId, displayName, tokenHash: createHash("sha256").update(token).digest("hex"), expiresAt });
    return { member_identity_id: result.memberId, invitation_token: token, expires_at: expiresAt.toISOString() };
  }

  accept(session: EmployeeSession, token: string) { return this.repository.acceptInvitation(session.accountId, token); }

  async createJoinCode(session:AdminSession) { requireTenantAdminRole(session,"admin"); const token=randomToken("join",24); const expiresAt=new Date(Date.now()+30*24*60*60*1000); await this.repository.createJoinCode({tenantId:session.tenantId,tokenHash:createHash("sha256").update(token).digest("hex"),expiresAt}); return {join_token:token,expires_at:expiresAt.toISOString()}; }
  submitJoinRequest(session:EmployeeSession,token:string,displayName:string) { return this.repository.submitJoinRequest({accountId:session.accountId,rawToken:token,displayName}); }
  async listJoinRequests(session:AdminSession) { requireTenantAdminRole(session,"admin"); return {items:await this.repository.listJoinRequests(session.tenantId)}; }
  reviewJoinRequest(session:AdminSession,requestId:string,decision:"approved"|"rejected") { requireTenantAdminRole(session,"admin"); return this.repository.reviewJoinRequest({tenantId:session.tenantId,requestId,adminId:session.memberIdentityId,decision}); }
}
