import { ConflictException, Injectable, UnauthorizedException } from "@nestjs/common";
import { createHash } from "node:crypto";
import type { QueryResultRow } from "pg";
import { defaultEmployeeCardSlug, defaultEmployeePublicId } from "../common/default-public-id.js";
import { DatabaseService, type DatabaseTransaction } from "../database/database.service.js";
import type { EmployeeSession } from "../session/employee-session.js";

interface IdRow extends QueryResultRow { id: string | number | bigint; }
interface InviteRow extends QueryResultRow { tenant_id: string | number | bigint; member_identity_id: string | number | bigint; name: string; }
interface JoinRequestRow extends QueryResultRow { id:string|number|bigint; tenant_id:string|number|bigint; account_id:string|number|bigint; display_name:string; status:"pending"|"approved"|"rejected"|"cancelled"; created_at:Date|string; }
interface LocalAdminRow extends QueryResultRow { tenant_id:string|number|bigint; tenant_name:string; member_identity_id:string|number|bigint; open_userid:string; role:"owner"|"admin"|"operator"|"auditor"; creation_source?:"local"|"wecom"|null; open_corpid?:string|null; auth_status?:string|null; member_count?:string|number; last_login_at?:Date|string|null; }
interface LocalAdminCandidateRow extends QueryResultRow { tenant_id:string|number|bigint; tenant_name:string; member_identity_id:string|number|bigint; creation_source:"local"|"wecom"|null; open_corpid:string|null; auth_status:string|null; }
interface AdminChallengeRow extends QueryResultRow { account_id:string|number|bigint|null; tenant_id:string|number|bigint|null; member_identity_id:string|number|bigint|null; status:"pending"|"approved"|"consumed"|"rejected"; expires_at:Date|string; created_at:Date|string; client_ip:string|null; client_device:string|null; client_location:string|null; }
interface JoinPreviewRow extends QueryResultRow { tenant_id:string|number|bigint; tenant_name:string; company_name:string|null; company_short_name:string|null; logo_url:string|null; website_url:string|null; address:string|null; public_id:string|null; }

@Injectable()
export class LocalEnterpriseRepository {
  constructor(private readonly database: DatabaseService) {}

  /**
   * 为普通微信账号创建本地企业及首个 owner 身份。
   *
   * 使用账号级 advisory lock 限制并发创建；同一账号最多拥有 3 个本地企业 owner 身份。
   */
  async createEnterprise(session: EmployeeSession, name: string) {
    return this.database.transaction(async (tx) => {
      await tx.query("SELECT set_config('app.account_id',$1,true)", [session.accountId]);
      await tx.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [`local-enterprise:${session.accountId}`]);
      const owned = await tx.query<{ count:string }>(`SELECT count(*)::text AS count FROM account_identity_bindings b JOIN tenants t ON t.id=b.tenant_id WHERE b.account_id=$1 AND b.bind_source='local_owner' AND t.creation_source='local'`, [session.accountId]);
      if (Number(owned.rows[0]?.count ?? 0) >= 3) throw new ConflictException("local enterprise ownership limit reached");
      const tenant = await tx.query<IdRow>(`INSERT INTO tenants (name, creation_source, auth_status, created_at, updated_at) VALUES ($1,'local','unconnected',now(),now()) RETURNING id`, [name]);
      const tenantId = String(tenant.rows[0]!.id);
      await this.context(tx, session.accountId, tenantId);
      const member = await tx.query<IdRow>(`INSERT INTO member_identities (tenant_id,name,status,created_at,updated_at) VALUES ($1,$2,'active',now(),now()) RETURNING id`, [tenantId, session.displayName || "企业创建人"]);
      const memberId = String(member.rows[0]!.id);
      await tx.query(`INSERT INTO account_identity_bindings (account_id,tenant_id,member_identity_id,bind_source,created_at) VALUES ($1,$2,$3,'local_owner',now())`, [session.accountId, tenantId, memberId]);
      await this.createCard(tx, tenantId, memberId, session.displayName || "企业创建人");
      const openUserid = `account:${session.accountId}`;
      await tx.query(`INSERT INTO tenant_admins (tenant_id,member_identity_id,open_userid,role,status,auth_source,created_at,updated_at) VALUES ($1,$2,$3,'owner','active','local_account',now(),now())`, [tenantId, memberId, openUserid]);
      return { tenantId, memberId, tenantName: name, openUserid };
    });
  }

  /**
   * 认领平台创建的空本地企业。
   *
   * token 必须未使用且未过期；企业必须是本地、启用、未删除，并且尚无 active owner。
   */
  async claimEnterprise(input: { accountId: string; rawToken: string; displayName: string }) {
    const tokenHash = createHash("sha256").update(input.rawToken).digest("hex");
    return this.database.transaction(async (tx) => {
      const tokenRow = await tx.query<{ tenant_id: string | number | bigint; tenant_name: string }>(
        `SELECT c.tenant_id, t.name AS tenant_name
         FROM admin_claim_tokens c
         JOIN tenants t ON t.id = c.tenant_id
         WHERE c.token_hash = $1
           AND c.used_at IS NULL
           AND c.expires_at > now()
           AND t.tenant_type = 'enterprise'
           AND t.creation_source = 'local'
           AND t.deleted_at IS NULL
           AND t.status = 'active'
         FOR UPDATE OF c`,
        [tokenHash]
      );
      const row = tokenRow.rows[0];
      if (!row) throw new ConflictException("认领码无效或已过期");
      const tenantId = String(row.tenant_id);
      await this.context(tx, input.accountId, tenantId);
      const owner = await tx.query(`SELECT 1 FROM tenant_admins WHERE tenant_id=$1 AND role='owner' AND status='active' LIMIT 1`, [tenantId]);
      if (owner.rows[0]) throw new ConflictException("企业已被认领");
      const bound = await tx.query(`SELECT 1 FROM account_identity_bindings WHERE tenant_id=$1 AND account_id=$2 LIMIT 1`, [tenantId, input.accountId]);
      if (bound.rows[0]) throw new ConflictException("当前微信已在该企业拥有身份");
      const member = await tx.query<IdRow>(`INSERT INTO member_identities (tenant_id,name,status,created_at,updated_at) VALUES ($1,$2,'active',now(),now()) RETURNING id`, [tenantId, input.displayName]);
      const memberId = String(member.rows[0]!.id);
      await tx.query(`INSERT INTO account_identity_bindings (account_id,tenant_id,member_identity_id,bind_source,created_at) VALUES ($1,$2,$3,'local_owner',now())`, [input.accountId, tenantId, memberId]);
      await this.createCard(tx, tenantId, memberId, input.displayName);
      const openUserid = `account:${input.accountId}`;
      await tx.query(`INSERT INTO tenant_admins (tenant_id,member_identity_id,open_userid,role,status,auth_source,created_at,updated_at) VALUES ($1,$2,$3,'owner','active','claim_token',now(),now())`, [tenantId, memberId, openUserid]);
      await tx.query(`UPDATE admin_claim_tokens SET used_at=now() WHERE tenant_id=$1 AND used_at IS NULL AND expires_at>now()`, [tenantId]);
      return { tenantId, memberId, tenantName: row.tenant_name, openUserid };
    });
  }

  /**
   * 查询某账号在指定本地企业中的 active 管理员身份。
   *
   * 先设置账号和租户上下文，再读取 tenant_admins，确保 RLS 语义与登录身份一致。
   */
  async findLocalAdminForAccount(accountId:string,tenantId:string) {
    return this.database.transaction(async tx=>{
      await this.context(tx,accountId,tenantId);
      const result=await tx.query<LocalAdminRow>(`SELECT a.tenant_id,t.name AS tenant_name,a.member_identity_id,a.open_userid,a.role,t.creation_source,t.open_corpid,t.auth_status FROM account_identity_bindings b JOIN tenant_admins a ON a.tenant_id=b.tenant_id AND a.member_identity_id=b.member_identity_id JOIN tenants t ON t.id=a.tenant_id WHERE b.account_id=$1 AND b.tenant_id=$2 AND t.creation_source='local' AND a.status='active' LIMIT 1`,[accountId,tenantId]);
      const row=result.rows[0];
      return row?{tenantId:String(row.tenant_id),tenantName:row.tenant_name,memberId:String(row.member_identity_id),openUserid:row.open_userid,role:row.role,creationSource:row.creation_source,openCorpid:row.open_corpid,authStatus:row.auth_status}:null;
    });
  }

  /**
   * 查询某账号可管理的所有本地企业。
   *
   * 先按账号找候选绑定，再逐租户设置 RLS 上下文确认 active 管理员身份。
   */
  async listLocalAdminsForAccount(accountId:string){
    return this.database.transaction(async tx=>{
      await tx.query("SELECT set_config('app.account_id',$1,true)",[accountId]);
      const candidates=await tx.query<LocalAdminCandidateRow>(`SELECT b.tenant_id,t.name AS tenant_name,b.member_identity_id,t.creation_source,t.open_corpid,t.auth_status FROM account_identity_bindings b JOIN tenants t ON t.id=b.tenant_id WHERE b.account_id=$1 AND t.creation_source='local' ORDER BY t.name,b.tenant_id`,[accountId]);
      const admins=[] as Array<{tenantId:string;tenantName:string;memberId:string;openUserid:string;role:"owner"|"admin"|"operator"|"auditor";creationSource:"local"|"wecom"|null;openCorpid:string|null;authStatus:string|null;memberCount:number;lastLoginAt:string|null}>;
      for(const candidate of candidates.rows){
        const tenantId=String(candidate.tenant_id);const memberId=String(candidate.member_identity_id);
        await tx.query("SELECT set_config('app.tenant_id',$1,true)",[tenantId]);
        const result=await tx.query<LocalAdminRow>(`SELECT a.tenant_id,$3::text AS tenant_name,a.member_identity_id,a.open_userid,a.role,a.last_login_at,(SELECT count(*)::text FROM member_identities m WHERE m.tenant_id=a.tenant_id AND m.status='active') AS member_count FROM tenant_admins a WHERE a.tenant_id=$1 AND a.member_identity_id=$2 AND a.status='active' LIMIT 1`,[tenantId,memberId,candidate.tenant_name]);
        const row=result.rows[0];if(row)admins.push({tenantId,tenantName:row.tenant_name,memberId,openUserid:row.open_userid,role:row.role,creationSource:candidate.creation_source,openCorpid:candidate.open_corpid,authStatus:candidate.auth_status,memberCount:Number(row.member_count??0),lastLoginAt:row.last_login_at?new Date(row.last_login_at).toISOString():null});
      }
      return admins;
    });
  }

  /**
   * 创建后台扫码登录挑战记录。
   */
  async createAdminScanChallenge(input:{tokenHash:string;expiresAt:Date;clientIp:string;clientDevice:string;clientLocation:string}){
    await this.database.query(`INSERT INTO local_admin_login_challenges(token_hash,status,expires_at,client_ip,client_device,client_location,created_at) VALUES($1,'pending',$2,$3,$4,$5,now())`,[input.tokenHash,input.expiresAt,input.clientIp,input.clientDevice,input.clientLocation]);
  }

  async getAdminScanChallenge(tokenHash:string){
    const result=await this.database.query<AdminChallengeRow>(`SELECT account_id,tenant_id,member_identity_id,status,expires_at,created_at,client_ip,client_device,client_location FROM local_admin_login_challenges WHERE token_hash=$1`,[tokenHash]);
    const row=result.rows[0];
    if(!row||row.status!=="pending"||new Date(row.expires_at).getTime()<=Date.now()) throw new ConflictException("login challenge is invalid or expired");
    return row;
  }

  async rejectAdminScanChallenge(tokenHash:string){
    const result=await this.database.query(`UPDATE local_admin_login_challenges SET status='rejected' WHERE token_hash=$1 AND status IN ('pending','approved') AND expires_at>now()`,[tokenHash]);
    if(result.rowCount!==1) throw new ConflictException("login challenge can no longer be rejected");
  }

  /**
   * 批准后台扫码登录挑战。
   *
   * 只有 pending 且未过期的挑战会被更新，避免重复扫码或过期扫码换取后台会话。
   */
  async approveAdminScanChallenge(input:{tokenHash:string;accountId:string;admin:{tenantId:string;memberId:string}}){
    const result=await this.database.query(`UPDATE local_admin_login_challenges SET account_id=$2,tenant_id=$3,member_identity_id=$4,status='approved',approved_at=now() WHERE token_hash=$1 AND status='pending' AND expires_at>now()`,[input.tokenHash,input.accountId,input.admin.tenantId,input.admin.memberId]);
    if(result.rowCount!==1) throw new ConflictException("login challenge is invalid or expired");
  }

  /**
   * 消费后台扫码登录挑战。
   *
   * approved 挑战只可消费一次；消费前会重新验证账号仍然绑定 active 管理员身份。
   */
  async consumeAdminScanChallenge(tokenHash:string){
    return this.database.transaction(async tx=>{
      const result=await tx.query<AdminChallengeRow>(`SELECT account_id,tenant_id,member_identity_id,status,expires_at FROM local_admin_login_challenges WHERE token_hash=$1 FOR UPDATE`,[tokenHash]);
      const row=result.rows[0];
      if(!row||new Date(row.expires_at).getTime()<=Date.now()) return {status:"expired" as const};
      if(row.status!=="approved") return {status:row.status};
      if(!row.account_id||!row.tenant_id||!row.member_identity_id) return {status:"revoked" as const};
      const tenantId=String(row.tenant_id);const memberId=String(row.member_identity_id);
      await this.context(tx,String(row.account_id),tenantId);
      const adminResult=await tx.query<LocalAdminRow>(`SELECT a.tenant_id,t.name AS tenant_name,a.member_identity_id,a.open_userid,a.role FROM tenant_admins a JOIN tenants t ON t.id=a.tenant_id JOIN account_identity_bindings b ON b.tenant_id=a.tenant_id AND b.member_identity_id=a.member_identity_id WHERE a.tenant_id=$1 AND a.member_identity_id=$2 AND b.account_id=$3 AND a.status='active' LIMIT 1`,[tenantId,memberId,String(row.account_id)]);
      const admin=adminResult.rows[0];if(!admin)return {status:"revoked" as const};
      await tx.query(`UPDATE local_admin_login_challenges SET status='consumed',consumed_at=now() WHERE token_hash=$1 AND status='approved'`,[tokenHash]);
      return {status:"approved" as const,tenantId,tenantName:admin.tenant_name,memberId,openUserid:admin.open_userid,role:admin.role};
    });
  }

  /**
   * 创建本地企业成员邀请。
   *
   * 先创建 pending_invitation 成员和禁用名片，再写入邀请 token，接受邀请后统一激活。
   */
  async createInvitation(input: { tenantId: string; adminId: string | null; displayName: string; tokenHash: string; expiresAt: Date }) {
    return this.database.transaction(async (tx) => {
      await this.context(tx, null, input.tenantId);
      const member = await tx.query<IdRow>(`INSERT INTO member_identities (tenant_id,name,status,created_at,updated_at) VALUES ($1,$2,'pending_invitation',now(),now()) RETURNING id`, [input.tenantId, input.displayName]);
      const memberId = String(member.rows[0]!.id);
      await this.createCard(tx, input.tenantId, memberId, input.displayName, "disabled");
      await tx.query(`INSERT INTO member_invitations (tenant_id,member_identity_id,token_hash,created_by_admin_id,expires_at) VALUES ($1,$2,$3,$4,$5)`, [input.tenantId, memberId, input.tokenHash, input.adminId, input.expiresAt]);
      return { memberId };
    });
  }

  /**
   * 接受成员邀请并绑定当前微信账号。
   *
   * 同一租户内账号或成员已绑定时拒绝，避免一个微信账号重复占用多个成员身份。
   */
  async acceptInvitation(accountId: string, rawToken: string) {
    const tokenHash = createHash("sha256").update(rawToken).digest("hex");
    return this.database.transaction(async (tx) => {
      const lookup = await tx.query<InviteRow>(`SELECT i.tenant_id,i.member_identity_id,m.name FROM member_invitations i JOIN member_identities m ON m.id=i.member_identity_id WHERE i.token_hash=$1 AND i.used_at IS NULL AND i.revoked_at IS NULL AND i.expires_at>now() FOR UPDATE`, [tokenHash]);
      const invite = lookup.rows[0];
      if (!invite) throw new UnauthorizedException("invalid or expired member invitation");
      const tenantId = String(invite.tenant_id);
      const memberId = String(invite.member_identity_id);
      await this.context(tx, accountId, tenantId);
      const bound = await tx.query(`SELECT 1 FROM account_identity_bindings WHERE tenant_id=$1 AND (member_identity_id=$2 OR account_id=$3)`, [tenantId, memberId,accountId]);
      if (bound.rows[0]) throw new ConflictException("member or account is already bound in this enterprise");
      await tx.query(`INSERT INTO account_identity_bindings (account_id,tenant_id,member_identity_id,bind_source,created_at) VALUES ($1,$2,$3,'member_invitation',now())`, [accountId, tenantId, memberId]);
      await tx.query(`UPDATE member_identities SET status='active',updated_at=now() WHERE tenant_id=$1 AND id=$2`,[tenantId,memberId]);
      await tx.query(`UPDATE cards SET status='active',updated_at=now() WHERE tenant_id=$1 AND member_identity_id=$2 AND card_type='primary'`,[tenantId,memberId]);
      await tx.query(`UPDATE public_card_directory d SET status='active',updated_at=now(),card_updated_at=now() FROM cards c WHERE c.id=d.card_id AND d.tenant_id=$1 AND c.member_identity_id=$2`,[tenantId,memberId]);
      await tx.query(`UPDATE member_invitations SET used_at=now() WHERE token_hash=$1`, [tokenHash]);
      return { tenantId, memberId, displayName: invite.name };
    });
  }

  /**
   * 创建新的企业加入码。
   *
   * 使用租户级 advisory lock，先撤销旧有效码，再插入新码，保证同一时间只有一个有效加入码。
   */
  async createJoinCode(input:{tenantId:string;tokenHash:string;expiresAt:Date}) {
    await this.database.transaction(async tx=>{
      await tx.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",[`tenant-join-code:${input.tenantId}`]);
      await tx.query(`UPDATE tenant_join_codes SET revoked_at=now() WHERE tenant_id=$1 AND revoked_at IS NULL`,[input.tenantId]);
      await tx.query(`INSERT INTO tenant_join_codes (tenant_id,token_hash,expires_at) VALUES ($1,$2,$3)`,[input.tenantId,input.tokenHash,input.expiresAt]);
    });
  }

  /** 读取有效加入码对应的公开企业摘要，不返回租户内部信息。 */
  async getJoinPreview(rawToken:string) {
    const hash=createHash("sha256").update(rawToken).digest("hex");
    const result=await this.database.transaction(async tx=>{
      const code=await tx.query<{tenant_id:string|number|bigint}>(`SELECT tenant_id FROM tenant_join_codes WHERE token_hash=$1 AND revoked_at IS NULL AND expires_at>now()`,[hash]);
      if(!code.rows[0]) throw new UnauthorizedException("invalid or expired enterprise join code");
      const tenantId=String(code.rows[0].tenant_id);
      await this.context(tx,null,tenantId);
      return tx.query<JoinPreviewRow>(`SELECT t.id AS tenant_id,t.name AS tenant_name,p.display_name AS company_name,p.short_name AS company_short_name,p.logo_url,p.website_url,p.address,(SELECT c.public_id FROM cards c JOIN public_card_directory d ON d.card_id=c.id AND d.tenant_id=c.tenant_id WHERE c.tenant_id=t.id AND c.status='active' AND d.status='active' ORDER BY c.created_at ASC LIMIT 1) AS public_id FROM tenants t LEFT JOIN company_profiles p ON p.tenant_id=t.id AND p.deleted_at IS NULL AND p.visible=true AND p.status='published' WHERE t.id=$1 AND t.deleted_at IS NULL AND t.status='active'`,[tenantId]);
    });
    const row=result.rows[0];
    if(!row) throw new UnauthorizedException("enterprise is unavailable");
    return {tenantId:String(row.tenant_id),name:row.company_name||row.tenant_name,shortName:row.company_short_name||"",logoUrl:row.logo_url||"",websiteUrl:row.website_url||"",address:row.address||"",publicId:row.public_id||""};
  }

  /**
   * 提交加入企业申请。
   *
   * 有效加入码决定目标租户；同一账号在同一租户已有 pending 申请时更新展示名而不是重复插入。
   */
  async submitJoinRequest(input:{accountId:string;rawToken:string;displayName:string;notificationTemplateId?:string}) {
    const hash=createHash("sha256").update(input.rawToken).digest("hex");
    return this.database.transaction(async tx=>{
      const code=await tx.query<{tenant_id:string|number|bigint}>(`SELECT tenant_id FROM tenant_join_codes WHERE token_hash=$1 AND revoked_at IS NULL AND expires_at>now()`,[hash]);
      if(!code.rows[0]) throw new UnauthorizedException("invalid or expired enterprise join code");
      const tenantId=String(code.rows[0].tenant_id);
      await this.context(tx,input.accountId,tenantId);
      const existing=await tx.query(`SELECT 1 FROM account_identity_bindings WHERE tenant_id=$1 AND account_id=$2 LIMIT 1`,[tenantId,input.accountId]);
      if(existing.rows[0]) throw new ConflictException("account is already a member of this enterprise");
      const result=await tx.query<IdRow>(`INSERT INTO member_join_requests (tenant_id,account_id,display_name,notification_template_id) VALUES ($1,$2,$3,$4) ON CONFLICT (tenant_id,account_id) WHERE status='pending' DO UPDATE SET display_name=EXCLUDED.display_name,notification_template_id=COALESCE(EXCLUDED.notification_template_id,member_join_requests.notification_template_id) RETURNING id`,[tenantId,input.accountId,input.displayName,input.notificationTemplateId??null]);
      return {requestId:String(result.rows[0]!.id),tenantId};
    });
  }

  async subscribeJoinReview(input:{accountId:string;requestId:string;templateId:string}){
    const result=await this.database.query(`UPDATE member_join_requests SET notification_template_id=$3 WHERE id=$1 AND account_id=$2 AND status='pending' RETURNING id`,[input.requestId,input.accountId,input.templateId]);
    if(!result.rows[0]) throw new ConflictException("join request is not pending");
    return {subscribed:true};
  }

  async getJoinNotificationTarget(requestId:string){
    const result=await this.database.query<{primary_wx_openid:string|null;notification_template_id:string|null;tenant_name:string}>(`SELECT a.primary_wx_openid,r.notification_template_id,t.name AS tenant_name FROM member_join_requests r JOIN accounts a ON a.id=r.account_id JOIN tenants t ON t.id=r.tenant_id WHERE r.id=$1`,[requestId]);
    const row=result.rows[0];
    return row?{openid:row.primary_wx_openid||"",templateId:row.notification_template_id||"",companyName:row.tenant_name}:null;
  }

  markJoinNotification(requestId:string,error:string|null){return this.database.query(`UPDATE member_join_requests SET notified_at=CASE WHEN $2::text IS NULL THEN now() ELSE notified_at END,notification_error=$2 WHERE id=$1`,[requestId,error]);}

  /**
   * 列出本地企业加入申请。
   */
  async listJoinRequests(tenantId:string) {
    const result=await this.database.query<JoinRequestRow>(`SELECT id,tenant_id,account_id,display_name,status,created_at FROM member_join_requests WHERE tenant_id=$1 ORDER BY created_at DESC LIMIT 200`,[tenantId]);
    return result.rows.map(r=>({id:String(r.id),displayName:r.display_name,status:r.status,createdAt:new Date(r.created_at).toISOString()}));
  }

  /**
   * 审核加入申请。
   *
   * 拒绝只更新申请状态；通过会创建成员、账号绑定和默认名片。
   */
  async reviewJoinRequest(input:{tenantId:string;requestId:string;adminId:string|null;decision:"approved"|"rejected"}) {
    return this.database.transaction(async tx=>{
      const result=await tx.query<JoinRequestRow>(`SELECT id,tenant_id,account_id,display_name,status,created_at FROM member_join_requests WHERE id=$1 AND tenant_id=$2 FOR UPDATE`,[input.requestId,input.tenantId]);
      const request=result.rows[0];
      if(!request || request.status!=="pending") throw new ConflictException("join request is not pending");
      if(input.decision==="rejected") { await tx.query(`UPDATE member_join_requests SET status='rejected',reviewed_by_admin_id=$2,reviewed_at=now() WHERE id=$1`,[input.requestId,input.adminId]); return {status:"rejected" as const,memberId:null}; }
      await this.context(tx,String(request.account_id),input.tenantId);
      const existing=await tx.query(`SELECT 1 FROM account_identity_bindings WHERE tenant_id=$1 AND account_id=$2 LIMIT 1`,[input.tenantId,String(request.account_id)]);
      if(existing.rows[0]) throw new ConflictException("account is already a member of this enterprise");
      const member=await tx.query<IdRow>(`INSERT INTO member_identities (tenant_id,name,status,created_at,updated_at) VALUES ($1,$2,'active',now(),now()) RETURNING id`,[input.tenantId,request.display_name]);
      const memberId=String(member.rows[0]!.id);
      await tx.query(`INSERT INTO account_identity_bindings (account_id,tenant_id,member_identity_id,bind_source,created_at) VALUES ($1,$2,$3,'join_request',now())`,[String(request.account_id),input.tenantId,memberId]);
      await this.createCard(tx,input.tenantId,memberId,request.display_name);
      await tx.query(`INSERT INTO account_preferences (account_id,default_member_identity_id,last_member_identity_id,updated_at) VALUES ($1,$2,$2,now()) ON CONFLICT (account_id) DO UPDATE SET last_member_identity_id=EXCLUDED.last_member_identity_id,updated_at=now()`,[String(request.account_id),memberId]);
      await tx.query(`UPDATE member_join_requests SET status='approved',reviewed_by_admin_id=$2,reviewed_at=now() WHERE id=$1`,[input.requestId,input.adminId]);
      return {status:"approved" as const,memberId};
    });
  }

  /**
   * 为本地企业成员创建默认主名片和公开目录项。
   */
  private async createCard(tx: DatabaseTransaction, tenantId: string, memberId: string, name: string, status = "active") {
    const publicId = defaultEmployeePublicId({ tenantId, memberIdentityId: memberId });
    const slug = defaultEmployeeCardSlug({ tenantId, memberIdentityId: memberId });
    const card = await tx.query<IdRow>(`INSERT INTO cards (tenant_id,member_identity_id,public_id,card_type,slug,display_name,status,created_at,updated_at) VALUES ($1,$2,$3,'primary',$4,$5,$6,now(),now()) RETURNING id`, [tenantId, memberId, publicId, slug, name,status]);
    await tx.query(`INSERT INTO public_card_directory (public_id,tenant_id,card_id,status,card_updated_at,created_at,updated_at) VALUES ($1,$2,$3,$4,now(),now(),now())`, [publicId, tenantId, String(card.rows[0]!.id),status]);
    return publicId;
  }

  /**
   * 设置当前事务的租户/账号 RLS 上下文。
   */
  private async context(tx: DatabaseTransaction, accountId: string | null, tenantId: string) {
    await tx.query("SELECT set_config('app.tenant_id',$1,true)", [tenantId]);
    if (accountId) await tx.query("SELECT set_config('app.account_id',$1,true)", [accountId]);
  }
}
