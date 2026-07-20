import { ConflictException, Injectable, UnauthorizedException } from "@nestjs/common";
import { createHash } from "node:crypto";
import type { QueryResultRow } from "pg";
import { defaultEmployeeCardSlug, defaultEmployeePublicId } from "../common/default-public-id.js";
import { DatabaseService, type DatabaseTransaction } from "../database/database.service.js";
import type { EmployeeSession } from "../session/employee-session.js";

interface IdRow extends QueryResultRow { id: string | number | bigint; }
interface InviteRow extends QueryResultRow { tenant_id: string | number | bigint; member_identity_id: string | number | bigint; name: string; }
interface JoinRequestRow extends QueryResultRow { id:string|number|bigint; tenant_id:string|number|bigint; account_id:string|number|bigint; display_name:string; status:"pending"|"approved"|"rejected"|"cancelled"; created_at:Date|string; }
interface LocalAdminRow extends QueryResultRow { tenant_id:string|number|bigint; tenant_name:string; member_identity_id:string|number|bigint; open_userid:string; role:"owner"|"admin"|"operator"|"auditor"; }

@Injectable()
export class LocalEnterpriseRepository {
  constructor(private readonly database: DatabaseService) {}

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

  async findLocalAdminForAccount(accountId:string,tenantId:string) {
    return this.database.transaction(async tx=>{
      await this.context(tx,accountId,tenantId);
      const result=await tx.query<LocalAdminRow>(`SELECT a.tenant_id,t.name AS tenant_name,a.member_identity_id,a.open_userid,a.role FROM account_identity_bindings b JOIN tenant_admins a ON a.tenant_id=b.tenant_id AND a.member_identity_id=b.member_identity_id JOIN tenants t ON t.id=a.tenant_id WHERE b.account_id=$1 AND b.tenant_id=$2 AND t.creation_source='local' AND a.status='active' LIMIT 1`,[accountId,tenantId]);
      const row=result.rows[0];
      return row?{tenantId:String(row.tenant_id),tenantName:row.tenant_name,memberId:String(row.member_identity_id),openUserid:row.open_userid,role:row.role}:null;
    });
  }

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

  async createJoinCode(input:{tenantId:string;tokenHash:string;expiresAt:Date}) {
    await this.database.transaction(async tx=>{
      await tx.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",[`tenant-join-code:${input.tenantId}`]);
      await tx.query(`UPDATE tenant_join_codes SET revoked_at=now() WHERE tenant_id=$1 AND revoked_at IS NULL`,[input.tenantId]);
      await tx.query(`INSERT INTO tenant_join_codes (tenant_id,token_hash,expires_at) VALUES ($1,$2,$3)`,[input.tenantId,input.tokenHash,input.expiresAt]);
    });
  }

  async submitJoinRequest(input:{accountId:string;rawToken:string;displayName:string}) {
    const hash=createHash("sha256").update(input.rawToken).digest("hex");
    return this.database.transaction(async tx=>{
      const code=await tx.query<{tenant_id:string|number|bigint}>(`SELECT tenant_id FROM tenant_join_codes WHERE token_hash=$1 AND revoked_at IS NULL AND expires_at>now()`,[hash]);
      if(!code.rows[0]) throw new UnauthorizedException("invalid or expired enterprise join code");
      const tenantId=String(code.rows[0].tenant_id);
      await this.context(tx,input.accountId,tenantId);
      const existing=await tx.query(`SELECT 1 FROM account_identity_bindings WHERE tenant_id=$1 AND account_id=$2 LIMIT 1`,[tenantId,input.accountId]);
      if(existing.rows[0]) throw new ConflictException("account is already a member of this enterprise");
      const result=await tx.query<IdRow>(`INSERT INTO member_join_requests (tenant_id,account_id,display_name) VALUES ($1,$2,$3) ON CONFLICT (tenant_id,account_id) WHERE status='pending' DO UPDATE SET display_name=EXCLUDED.display_name RETURNING id`,[tenantId,input.accountId,input.displayName]);
      return {requestId:String(result.rows[0]!.id),tenantId};
    });
  }

  async listJoinRequests(tenantId:string) {
    const result=await this.database.query<JoinRequestRow>(`SELECT id,tenant_id,account_id,display_name,status,created_at FROM member_join_requests WHERE tenant_id=$1 ORDER BY created_at DESC LIMIT 200`,[tenantId]);
    return result.rows.map(r=>({id:String(r.id),displayName:r.display_name,status:r.status,createdAt:new Date(r.created_at).toISOString()}));
  }

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
      await tx.query(`UPDATE member_join_requests SET status='approved',reviewed_by_admin_id=$2,reviewed_at=now() WHERE id=$1`,[input.requestId,input.adminId]);
      return {status:"approved" as const,memberId};
    });
  }

  private async createCard(tx: DatabaseTransaction, tenantId: string, memberId: string, name: string, status = "active") {
    const publicId = defaultEmployeePublicId({ tenantId, memberIdentityId: memberId });
    const slug = defaultEmployeeCardSlug({ tenantId, memberIdentityId: memberId });
    const card = await tx.query<IdRow>(`INSERT INTO cards (tenant_id,member_identity_id,public_id,card_type,slug,display_name,status,created_at,updated_at) VALUES ($1,$2,$3,'primary',$4,$5,$6,now(),now()) RETURNING id`, [tenantId, memberId, publicId, slug, name,status]);
    await tx.query(`INSERT INTO public_card_directory (public_id,tenant_id,card_id,status,card_updated_at,created_at,updated_at) VALUES ($1,$2,$3,$4,now(),now(),now())`, [publicId, tenantId, String(card.rows[0]!.id),status]);
    return publicId;
  }

  private async context(tx: DatabaseTransaction, accountId: string | null, tenantId: string) {
    await tx.query("SELECT set_config('app.tenant_id',$1,true)", [tenantId]);
    if (accountId) await tx.query("SELECT set_config('app.account_id',$1,true)", [accountId]);
  }
}
