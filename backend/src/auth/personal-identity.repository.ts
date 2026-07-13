import { ForbiddenException, Injectable, UnauthorizedException } from "@nestjs/common";
import type { QueryResultRow } from "pg";
import { defaultEmployeeCardSlug, defaultEmployeePublicId } from "../common/default-public-id.js";
import { DatabaseService } from "../database/database.service.js";
import type { LoginIdentity } from "./auth.repository.js";
import type { WxMiniProgramSession } from "./wx-miniprogram-login.service.js";

interface AccountRow extends QueryResultRow {
  id: string | number | bigint;
}

interface TenantRow extends QueryResultRow {
  id: string | number | bigint;
  name: string;
}

interface MemberRow extends QueryResultRow {
  id: string | number | bigint;
  name: string;
  open_userid: string | null;
}

interface IdentityRow extends QueryResultRow {
  tenant_id: string | number | bigint;
  tenant_name: string;
  tenant_type: "personal" | "enterprise";
  member_identity_id: string | number | bigint;
  display_name: string;
  open_userid: string | null;
  public_id: string | null;
}

interface CardRow extends QueryResultRow {
  id: string | number | bigint;
  public_id: string;
}

@Injectable()
export class PersonalIdentityRepository {
  private readonly memory = new Map<string, LoginIdentity>();
  private readonly memoryIdentities = new Map<string, LoginIdentity[]>();
  private memorySequence = 2000;

  constructor(private readonly database: DatabaseService) {}

  async provisionFromWxSession(session: WxMiniProgramSession): Promise<{ current: LoginIdentity; identities: LoginIdentity[] }> {
    const openid = session.openid.trim();
    if (!openid) {
      throw new UnauthorizedException("invalid WeChat openid");
    }
    if (!this.hasDatabase()) {
      const current = this.provisionInMemory(openid);
      return { current, identities: this.memoryIdentities.get(current.accountId) ?? [current] };
    }

    return this.database.transaction(async (tx) => {
      const accountId = await this.findOrCreateAccount({ openid, unionid: session.unionid }, tx);
      const tenant = await this.findOrCreatePersonalTenant(accountId, tx);
      // accounts/tenants carry no RLS, but every table touched below (member_identities,
      // account_identity_bindings, cards, account_preferences) is tenant/account isolated via
      // current_setting('app.tenant_id'|'app.account_id'). The runtime DB role is not BYPASSRLS,
      // so the context must be set here or the first RLS INSERT is rejected (login 500). See 99_55.
      await this.setRlsContext({ accountId, tenantId: String(tenant.id) }, tx);
      const member = await this.findOrCreatePersonalMember({ tenantId: String(tenant.id), openid }, tx);
      await this.ensureBinding({
        accountId,
        tenantId: String(tenant.id),
        memberIdentityId: String(member.id),
        bindSource: "wx_login"
      }, tx);
      const publicId = defaultEmployeePublicId({ tenantId: String(tenant.id), memberIdentityId: String(member.id) });
      const card = await this.ensureDefaultCard({
        tenantId: String(tenant.id),
        memberIdentityId: String(member.id),
        publicId,
        displayName: member.name
      }, tx);
      await this.ensureDefaultIdentity({ accountId, memberIdentityId: String(member.id) }, tx);

      const identities = await this.listAccountIdentitiesInTx(accountId, tx);
      const current = await this.pickPreferredIdentity({
        accountId,
        fallbackMemberIdentityId: String(member.id),
        identities,
        tx
      }) ?? {
        accountId,
        identityType: "personal",
        tenantId: String(tenant.id),
        tenantName: tenant.name,
        memberIdentityId: String(member.id),
        displayName: member.name,
        openUserid: member.open_userid,
        publicId: card.public_id
      };
      return { current, identities };
    });
  }

  async preferredAccountIdentity(
    accountId: string,
    fallbackMemberIdentityId: string
  ): Promise<{ current: LoginIdentity | null; identities: LoginIdentity[] }> {
    if (!this.hasDatabase()) {
      const identities = this.memoryIdentities.get(accountId) ?? [];
      return {
        current: identities.find((identity) => identity.memberIdentityId === fallbackMemberIdentityId) ?? identities[0] ?? null,
        identities
      };
    }
    return this.database.transaction(async (tx) => {
      const identities = await this.listAccountIdentitiesInTx(accountId, tx);
      return {
        current: await this.pickPreferredIdentity({ accountId, fallbackMemberIdentityId, identities, tx }),
        identities
      };
    });
  }

  async listAccountIdentities(accountId: string): Promise<LoginIdentity[]> {
    if (!this.hasDatabase()) {
      return this.memoryIdentities.get(accountId) ?? [];
    }
    return this.database.transaction((tx) => this.listAccountIdentitiesInTx(accountId, tx));
  }

  async switchIdentity(accountId: string, memberIdentityId: string): Promise<{ current: LoginIdentity; identities: LoginIdentity[] }> {
    if (!this.hasDatabase()) {
      const identities = this.memoryIdentities.get(accountId) ?? [];
      const current = identities.find((identity) => identity.memberIdentityId === memberIdentityId);
      if (!current) {
        throw new ForbiddenException("identity does not belong to current account");
      }
      return { current, identities };
    }
    return this.database.transaction(async (tx) => {
      const identities = await this.listAccountIdentitiesInTx(accountId, tx);
      const current = identities.find((identity) => identity.memberIdentityId === memberIdentityId);
      if (!current) {
        throw new ForbiddenException("identity does not belong to current account");
      }
      await this.setLastIdentity({ accountId, memberIdentityId }, tx);
      return { current, identities };
    });
  }

  private provisionInMemory(openid: string): LoginIdentity {
    const existing = this.memory.get(openid);
    if (existing) {
      return { ...existing };
    }
    this.memorySequence += 1;
    const accountId = `acct_${this.memorySequence}`;
    const tenantId = `personal_${this.memorySequence}`;
    const memberIdentityId = `member_${this.memorySequence}`;
    const current: LoginIdentity = {
      accountId,
      identityType: "personal",
      tenantId,
      tenantName: "个人名片",
      memberIdentityId,
      displayName: "我的名片",
      openUserid: `wx:${openid}`,
      publicId: defaultEmployeePublicId({ tenantId, memberIdentityId })
    };
    this.memory.set(openid, current);
    this.memoryIdentities.set(accountId, [current]);
    return { ...current };
  }

  private async findOrCreateAccount(
    input: { openid: string; unionid: string | null },
    tx: Tx
  ): Promise<string> {
    await this.lockAccountIdentity(input, tx);

    const existing = await tx.query<AccountRow>(
      `
        SELECT id
        FROM accounts
        WHERE ($1::varchar IS NOT NULL AND wx_unionid = $1)
           OR primary_wx_openid = $2
        LIMIT 1
      `,
      [input.unionid, input.openid]
    );
    const existingId = existing.rows[0]?.id;
    if (existingId !== undefined) {
      await tx.query(
        `
          UPDATE accounts
          SET wx_unionid = COALESCE(wx_unionid, $2),
              primary_wx_openid = COALESCE(primary_wx_openid, $3),
              updated_at = now()
          WHERE id = $1
        `,
        [existingId, input.unionid, input.openid]
      );
      return String(existingId);
    }

    const created = await tx.query<AccountRow>(
      `
        INSERT INTO accounts (wx_unionid, primary_wx_openid, status, created_at, updated_at)
        VALUES ($1, $2, 'active', now(), now())
        RETURNING id
      `,
      [input.unionid, input.openid]
    );
    const accountId = created.rows[0]?.id;
    if (accountId === undefined) {
      throw new Error("failed to create personal account");
    }
    return String(accountId);
  }

  private async setRlsContext(input: { accountId: string; tenantId: string }, tx: Tx): Promise<void> {
    await tx.query("SELECT set_config('app.account_id', $1, true)", [input.accountId]);
    await tx.query("SELECT set_config('app.tenant_id', $1, true)", [input.tenantId]);
  }

  private async lockAccountIdentity(input: { openid: string; unionid: string | null }, tx: Tx): Promise<void> {
    const keys = [`account:openid:${input.openid}`];
    if (input.unionid) {
      keys.push(`account:unionid:${input.unionid}`);
    }
    keys.sort();
    for (const key of keys) {
      await tx.query(
        `
          SELECT pg_advisory_xact_lock(hashtextextended($1, 0))
        `,
        [key]
      );
    }
  }

  private async findOrCreatePersonalTenant(accountId: string, tx: Tx): Promise<TenantRow> {
    const openCorpid = `personal:${accountId}`;
    const result = await tx.query<TenantRow>(
      `
        INSERT INTO tenants (
          name,
          tenant_type,
          open_corpid,
          auth_status,
          created_at,
          updated_at
        )
        VALUES ('个人名片', 'personal', $1, 'active', now(), now())
        ON CONFLICT (open_corpid) DO UPDATE SET
          tenant_type = 'personal',
          updated_at = now()
        RETURNING id, name
      `,
      [openCorpid]
    );
    const tenant = result.rows[0];
    if (!tenant) {
      throw new Error("failed to create personal tenant");
    }
    return tenant;
  }

  private async findOrCreatePersonalMember(input: { tenantId: string; openid: string }, tx: Tx): Promise<MemberRow> {
    const openUserid = `wx:${input.openid}`;
    const result = await tx.query<MemberRow>(
      `
        INSERT INTO member_identities (tenant_id, open_userid, name, status, created_at, updated_at)
        VALUES ($1, $2, '我的名片', 'active', now(), now())
        ON CONFLICT (tenant_id, open_userid) DO UPDATE SET
          status = 'active',
          updated_at = now()
        RETURNING id, name, open_userid
      `,
      [input.tenantId, openUserid]
    );
    const member = result.rows[0];
    if (!member) {
      throw new Error("failed to create personal member identity");
    }
    return member;
  }

  private async ensureBinding(input: { accountId: string; tenantId: string; memberIdentityId: string; bindSource: string }, tx: Tx) {
    await tx.query(
      `
        INSERT INTO account_identity_bindings (
          account_id,
          tenant_id,
          member_identity_id,
          bind_source,
          created_at
        )
        VALUES ($1, $2, $3, $4, now())
        ON CONFLICT (account_id, member_identity_id) DO NOTHING
      `,
      [input.accountId, input.tenantId, input.memberIdentityId, input.bindSource]
    );
  }

  private async ensureDefaultCard(
    input: { tenantId: string; memberIdentityId: string; publicId: string; displayName: string },
    tx: Tx
  ): Promise<CardRow> {
    const existing = await tx.query<CardRow>(
      `
        SELECT id, public_id
        FROM cards
        WHERE tenant_id = $1
          AND member_identity_id = $2
          AND card_type = 'primary'
          AND deleted_at IS NULL
        LIMIT 1
      `,
      [input.tenantId, input.memberIdentityId]
    );
    if (existing.rows[0]) {
      return existing.rows[0];
    }

    const created = await tx.query<CardRow>(
      `
        INSERT INTO cards (
          tenant_id,
          member_identity_id,
          public_id,
          card_type,
          slug,
          display_name,
          privacy_json,
          status,
          created_at,
          updated_at
        )
        VALUES ($1, $2, $3, 'primary', $4, $5, $6, 'active', now(), now())
        RETURNING id, public_id
      `,
      [
        input.tenantId,
        input.memberIdentityId,
        input.publicId,
        defaultEmployeeCardSlug(input),
        input.displayName,
        JSON.stringify({ show_mobile: false, show_email: true, show_wechat: false, allow_forward: true })
      ]
    );
    const card = created.rows[0];
    if (!card) {
      throw new Error("failed to create personal card");
    }
    await tx.query(
      `
        INSERT INTO public_card_directory (
          public_id,
          tenant_id,
          card_id,
          status,
          card_updated_at,
          created_at,
          updated_at
        )
        VALUES ($1, $2, $3, 'active', now(), now(), now())
        ON CONFLICT (public_id) DO UPDATE SET
          status = 'active',
          card_updated_at = now(),
          updated_at = now()
        WHERE public_card_directory.tenant_id = EXCLUDED.tenant_id
          AND public_card_directory.card_id = EXCLUDED.card_id
      `,
      [card.public_id, input.tenantId, card.id]
    );
    return card;
  }

  private async setLastIdentity(input: { accountId: string; memberIdentityId: string }, tx: Tx): Promise<void> {
    await tx.query(
      `
        INSERT INTO account_preferences (
          account_id,
          default_member_identity_id,
          last_member_identity_id,
          updated_at
        )
        VALUES ($1, $2, $2, now())
        ON CONFLICT (account_id) DO UPDATE SET
          default_member_identity_id = COALESCE(account_preferences.default_member_identity_id, EXCLUDED.default_member_identity_id),
          last_member_identity_id = EXCLUDED.last_member_identity_id,
          updated_at = now()
      `,
      [input.accountId, input.memberIdentityId]
    );
  }

  private async ensureDefaultIdentity(input: { accountId: string; memberIdentityId: string }, tx: Tx): Promise<void> {
    await tx.query(
      `
        INSERT INTO account_preferences (
          account_id,
          default_member_identity_id,
          last_member_identity_id,
          updated_at
        )
        VALUES ($1, $2, $2, now())
        ON CONFLICT (account_id) DO UPDATE SET
          default_member_identity_id = COALESCE(account_preferences.default_member_identity_id, EXCLUDED.default_member_identity_id),
          last_member_identity_id = COALESCE(account_preferences.last_member_identity_id, EXCLUDED.last_member_identity_id),
          updated_at = now()
      `,
      [input.accountId, input.memberIdentityId]
    );
  }

  private async pickPreferredIdentity(input: {
    accountId: string;
    fallbackMemberIdentityId: string;
    identities: LoginIdentity[];
    tx: Tx;
  }): Promise<LoginIdentity | null> {
    const preferences = await input.tx.query<{ last_member_identity_id: string | number | bigint | null; default_member_identity_id: string | number | bigint | null }>(
      `
        SELECT last_member_identity_id, default_member_identity_id
        FROM account_preferences
        WHERE account_id = $1
        LIMIT 1
      `,
      [input.accountId]
    );
    const preference = preferences.rows[0];
    const preferredMemberIdentityId = String(
      preference?.last_member_identity_id ?? preference?.default_member_identity_id ?? input.fallbackMemberIdentityId
    );
    return input.identities.find((identity) => identity.memberIdentityId === preferredMemberIdentityId)
      ?? input.identities.find((identity) => identity.memberIdentityId === input.fallbackMemberIdentityId)
      ?? input.identities[0]
      ?? null;
  }

  private async listAccountIdentitiesInTx(accountId: string, tx: Tx): Promise<LoginIdentity[]> {
    const result = await tx.query<IdentityRow>(
      `
        SELECT
          b.tenant_id,
          t.name AS tenant_name,
          COALESCE(t.tenant_type, 'enterprise') AS tenant_type,
          b.member_identity_id,
          m.name AS display_name,
          m.open_userid,
          c.public_id
        FROM account_identity_bindings b
        JOIN tenants t ON t.id = b.tenant_id
        JOIN member_identities m ON m.id = b.member_identity_id
        LEFT JOIN cards c ON c.tenant_id = b.tenant_id
          AND c.member_identity_id = b.member_identity_id
          AND c.card_type = 'primary'
          AND c.deleted_at IS NULL
        WHERE b.account_id = $1
        ORDER BY
          CASE WHEN COALESCE(t.tenant_type, 'enterprise') = 'personal' THEN 0 ELSE 1 END,
          b.created_at ASC
      `,
      [accountId]
    );
    return result.rows.map((row) => {
      const tenantId = String(row.tenant_id);
      const memberIdentityId = String(row.member_identity_id);
      return {
        accountId,
        identityType: row.tenant_type === "personal" ? "personal" : "wecom_member",
        tenantId,
        tenantName: row.tenant_name,
        memberIdentityId,
        displayName: row.display_name,
        openUserid: row.open_userid,
        publicId: row.public_id ?? defaultEmployeePublicId({ tenantId, memberIdentityId })
      };
    });
  }

  private hasDatabase(): boolean {
    return Boolean(process.env.DATABASE_URL?.trim());
  }
}

type Tx = {
  query<T extends QueryResultRow = QueryResultRow>(text: string, values?: unknown[]): Promise<{ rows: T[] }>;
};
