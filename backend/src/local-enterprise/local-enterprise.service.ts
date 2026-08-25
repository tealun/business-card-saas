import { ForbiddenException, Injectable, Logger } from "@nestjs/common";
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
import { AppConfig } from "../config/app-config.js";

@Injectable()
export class LocalEnterpriseService {
  private readonly logger = new Logger(LocalEnterpriseService.name);

  constructor(private readonly repository: LocalEnterpriseRepository, private readonly adminTokens: AdminSessionTokenService, private readonly audit: AdminOperationLogService, private readonly joinQr:WechatJoinQrService, private readonly config:AppConfig) {}

  /**
   * 普通微信用户自助创建本地企业，并立即成为该企业 owner。
   *
   * 返回租户 id、成员身份 id 和后台管理 token，供小程序创建后直接进入企业后台。
   */
  async create(session: EmployeeSession, name: string) {
    const created = await this.repository.createEnterprise(session, name);
    const adminSession: AdminSession = { tenantId: created.tenantId, tenantName: created.tenantName, memberIdentityId: created.memberId, openUserid: created.openUserid, role: "owner", accountType: "tenant" };
    return { tenant_id: created.tenantId, member_identity_id: created.memberId, admin_access_token: this.adminTokens.sign(adminSession), expires_in: this.adminTokens.expiresIn };
  }

  /**
   * 为当前微信账号创建指定本地企业的后台会话。
   *
   * 只有该账号在目标企业内拥有 active 管理员身份时才会签发后台 token。
   */
  async createAdminSession(session: EmployeeSession, tenantId: string) {
    const admin = await this.repository.findLocalAdminForAccount(session.accountId, tenantId);
    if (!admin) throw new ForbiddenException("active local enterprise administrator required");
    const adminSession: AdminSession = { tenantId: admin.tenantId, tenantName: admin.tenantName, memberIdentityId: admin.memberId, openUserid: admin.openUserid, role: admin.role, accountType: "tenant" };
    return { tenant_id: admin.tenantId, tenant_name: admin.tenantName, creation_source: admin.creationSource ?? null, open_corpid: admin.openCorpid ?? null, auth_status: admin.authStatus ?? null, wecom_bound: this.isWecomBound(admin), admin_access_token: this.adminTokens.sign(adminSession), expires_in: this.adminTokens.expiresIn };
  }

  /**
   * 创建后台扫码登录挑战。
   *
   * 挑战 5 分钟内有效，小程序扫码确认后，后台轮询接口才能换取管理 token。
   */
  async createAdminScanChallenge(){
    const token=randomToken("adm",21);
    const expiresAt=new Date(Date.now()+5*60*1000);
    const qrCodeDataUrl=await this.joinQr.generateScene(token,"pages/admin-login/index");
    await this.repository.createAdminScanChallenge(this.hash(token),expiresAt);
    return {challenge_token:token,status:"pending",expires_at:expiresAt.toISOString(),qr_code_data_url:qrCodeDataUrl,miniprogram_path:`pages/admin-login/index?scene=${encodeURIComponent(token)}`};
  }

  /**
   * 小程序端确认后台扫码登录。
   *
   * 如果当前微信账号管理多个本地企业且未指定 tenantId，则要求用户先选择企业。
   */
  async confirmAdminScan(session:EmployeeSession,token:string,tenantId?:string){
    const admins=await this.repository.listLocalAdminsForAccount(session.accountId);
    if(!admins.length) throw new ForbiddenException("当前微信账号不是本地企业管理员");
    if(!tenantId&&admins.length>1) return {requires_selection:true,tenants:admins.map(item=>({tenant_id:item.tenantId,tenant_name:item.tenantName,role:item.role}))};
    const selected=admins.find(item=>item.tenantId===(tenantId??admins[0]!.tenantId));
    if(!selected) throw new ForbiddenException("当前微信账号无权管理所选企业");
    await this.repository.approveAdminScanChallenge({tokenHash:this.hash(token),accountId:session.accountId,admin:selected});
    return {requires_selection:false,approved:true,tenant_id:selected.tenantId,tenant_name:selected.tenantName};
  }

  /**
   * 列出当前微信账号可管理的本地企业。
   */
  async listAdminTenants(session: EmployeeSession) {
    const admins = await this.repository.listLocalAdminsForAccount(session.accountId);
    return {items: admins.map((item) => ({tenant_id: item.tenantId, tenant_name: item.tenantName, role: item.role, creation_source: item.creationSource ?? null, open_corpid: item.openCorpid ?? null, auth_status: item.authStatus ?? null, wecom_bound: this.isWecomBound(item)}))};
  }

  /**
   * 后台轮询扫码登录挑战状态。
   *
   * 挑战被小程序批准后消费一次并签发租户后台会话；未批准时只返回当前状态。
   */
  async pollAdminScanChallenge(token:string){
    if(!/^adm_[A-Za-z0-9_-]{28}$/.test(token)) throw new ForbiddenException("invalid login challenge");
    const result=await this.repository.consumeAdminScanChallenge(this.hash(token));
    if(result.status!=="approved") return {status:result.status};
    const adminSession:AdminSession={tenantId:result.tenantId,tenantName:result.tenantName,memberIdentityId:result.memberId,openUserid:result.openUserid,role:result.role,accountType:"tenant"};
    const capabilities=adminCapabilities(adminSession);
    return {status:"approved",access_token:this.adminTokens.sign(adminSession),token_type:"Bearer",expires_in:this.adminTokens.expiresIn,admin:{tenant_id:result.tenantId,tenant_name:result.tenantName,member_identity_id:result.memberId,open_userid:result.openUserid,role:result.role,account_type:"tenant",permissions:capabilities.permissions,menu_scopes:capabilities.menuScopes}};
  }

  /**
   * 邀请新成员加入当前本地企业。
   *
   * 仅租户 admin 及以上可用，生成 24 小时有效的邀请码并记录审计日志。
   */
  async invite(session: AdminSession, displayName: string) {
    requireTenantAdminRole(session, "admin");
    const token = randomToken("member", 24);
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const result = await this.repository.createInvitation({ tenantId: session.tenantId, adminId: session.memberIdentityId, displayName, tokenHash: createHash("sha256").update(token).digest("hex"), expiresAt });
    await this.audit.record({ session, action: "local_member.invite", targetType: "member_identity", targetId: result.memberId, detail: { expires_at: expiresAt.toISOString() } });
    return { member_identity_id: result.memberId, invitation_token: token, expires_at: expiresAt.toISOString() };
  }

  /**
   * 普通微信用户接受成员邀请。
   */
  accept(session: EmployeeSession, token: string) { return this.repository.acceptInvitation(session.accountId, token); }

  /**
   * 认领平台创建的空本地企业。
   *
   * 普通微信账号消费认领码后成为该企业首个 owner，并获得后台管理会话。
   */
  async claim(session: EmployeeSession, token: string, displayName?: string) {
    const created = await this.repository.claimEnterprise({
      accountId: session.accountId,
      rawToken: token,
      displayName: displayName || session.displayName || "企业管理员"
    });
    const adminSession: AdminSession = { tenantId: created.tenantId, tenantName: created.tenantName, memberIdentityId: created.memberId, openUserid: created.openUserid, role: "owner", accountType: "tenant" };
    return { tenant_id: created.tenantId, tenant_name: created.tenantName, member_identity_id: created.memberId, admin_access_token: this.adminTokens.sign(adminSession), expires_in: this.adminTokens.expiresIn };
  }

  /**
   * 轮换本地企业成员加入码。
   *
   * 仅租户 admin 及以上可用，生成 30 天有效的加入 token 和二维码。
   */
  async createJoinCode(session:AdminSession) {
    requireTenantAdminRole(session,"admin");
    const token=randomToken("join",20);
    const expiresAt=new Date(Date.now()+30*24*60*60*1000);
    await this.repository.createJoinCode({tenantId:session.tenantId,tokenHash:createHash("sha256").update(token).digest("hex"),expiresAt});

    let qrCodeDataUrl:string|null=null;
    let qrCodeError:string|null=null;
    try {
      qrCodeDataUrl=await this.joinQr.generate(token);
    } catch (error) {
      qrCodeError="小程序码暂时无法生成，可直接分享邀请";
      this.logger.warn(`Mini Program join code generation failed for tenant ${session.tenantId}: ${error instanceof Error ? error.message : "unknown error"}`);
    }

    await this.audit.record({session,action:"local_join_code.rotate",targetType:"tenant",targetId:session.tenantId,detail:{expires_at:expiresAt.toISOString(),qr_generated:Boolean(qrCodeDataUrl)}});
    return {join_token:token,join_path:`pages/enterprise-join/index?token=${encodeURIComponent(token)}`,qr_code_data_url:qrCodeDataUrl,qr_code_error:qrCodeError,expires_at:expiresAt.toISOString()};
  }
  /**
   * 普通微信用户提交本地企业加入申请。
   */
  submitJoinRequest(session:EmployeeSession,token:string,displayName:string,notificationTemplateId?:string) {
    if(notificationTemplateId&&notificationTemplateId!==this.config.wechatJoinReviewTemplateId) throw new ForbiddenException("join review notification template is unavailable");
    return this.repository.submitJoinRequest({accountId:session.accountId,rawToken:token,displayName,...(notificationTemplateId?{notificationTemplateId}:{})});
  }
  /** 返回加入页展示所需的最小公开企业摘要。 */
  async getJoinPreview(token:string) { return {...await this.repository.getJoinPreview(token),notificationTemplateId:this.config.wechatJoinReviewTemplateId}; }
  subscribeJoinReview(session:EmployeeSession,requestId:string,templateId:string){
    if(!this.config.wechatJoinReviewTemplateId||templateId!==this.config.wechatJoinReviewTemplateId) throw new ForbiddenException("join review notification template is unavailable");
    return this.repository.subscribeJoinReview({accountId:session.accountId,requestId,templateId});
  }
  /**
   * 列出当前本地企业待审核加入申请。
   */
  async listJoinRequests(session:AdminSession) { requireTenantAdminRole(session,"admin"); return {items:await this.repository.listJoinRequests(session.tenantId)}; }
  /**
   * 审核本地企业加入申请。
   *
   * 审核通过会在 repository 内创建成员身份；服务层负责权限和审计日志。
   */
  async reviewJoinRequest(session:AdminSession,requestId:string,decision:"approved"|"rejected") { requireTenantAdminRole(session,"admin"); const result=await this.repository.reviewJoinRequest({tenantId:session.tenantId,requestId,adminId:session.memberIdentityId,decision}); await this.audit.record({session,action:`local_join_request.${decision}`,targetType:"member_join_request",targetId:requestId,detail:{member_id:result.memberId}}); await this.notifyJoinReview(requestId,decision); return result; }

  private async notifyJoinReview(requestId:string,decision:"approved"|"rejected"){
    try{
      const target=await this.repository.getJoinNotificationTarget(requestId);
      if(!target?.openid||!target.templateId) return;
      await this.joinQr.sendJoinReviewMessage({openid:target.openid,templateId:target.templateId,companyName:target.companyName,decision});
      await this.repository.markJoinNotification(requestId,null);
    } catch(error) {
      const message=error instanceof Error?error.message:"unknown error";
      this.logger.warn(`Join review notification ${requestId} failed: ${message}`);
      try { await this.repository.markJoinNotification(requestId,message.slice(0,1000)); }
      catch (persistError) { this.logger.warn(`Join review notification status ${requestId} failed: ${persistError instanceof Error ? persistError.message : "unknown error"}`); }
    }
  }

  /**
   * 判断本地企业是否已经绑定有效企业微信授权。
   */
  private isWecomBound(item:{openCorpid?:string|null|undefined;authStatus?:string|null|undefined}){return Boolean(item.openCorpid&&item.authStatus==="active");}

  /**
   * 对短期 token 做 SHA-256 摘要后入库。
   */
  private hash(token:string){return createHash("sha256").update(token).digest("hex");}
}
