import { Injectable } from "@nestjs/common";
import type { QueryResultRow } from "pg";
import { defaultEmployeeCardSlug, defaultEmployeePublicId } from "../common/default-public-id.js";
import { DatabaseService } from "../database/database.service.js";

export interface ProvisionWecomEmployeeInput {
  tenantId: string;
  tenantName: string;
  openUserid: string;
}

export interface ProvisionedWecomEmployee {
  accountId: string;
  tenantId: string;
  tenantName: string;
  memberIdentityId: string;
  displayName: string;
  openUserid: string;
  publicId: string;
}

interface MemoryEmployeeRecord extends ProvisionedWecomEmployee {}

interface MemberIdentityRow extends QueryResultRow {
  id: string | number | bigint;
  name: string;
}

interface AccountRow extends QueryResultRow {
  id: string | number | bigint;
}

interface BindingRow extends QueryResultRow {
  account_id: string | number | bigint;
}

interface CardRow extends QueryResultRow {
  id: string | number | bigint;
  public_id: string;
}

@Injectable()
export class WecomEmployeeProvisioningRepository {
  private readonly memory = new Map<string, MemoryEmployeeRecord>();
  private memorySequence = 1000;

  constructor(private readonly database: DatabaseService) {}

  async provision(input: ProvisionWecomEmployeeInput): Promise<ProvisionedWecomEmployee> {
    const normalizedOpenUserid = input.openUserid.trim();
    if (!this.hasDatabase()) {
      return this.provisionInMemory({ ...input, openUserid: normalizedOpenUserid });
    }

    return this.database.transaction(async (tx) => {
      const memberResult = await tx.query<MemberIdentityRow>(
        `
          INSERT INTO member_identities (tenant_id, open_userid, name, status, created_at, updated_at)
          VALUES ($1, $2, $2, 'active', now(), now())
          ON CONFLICT (tenant_id, open_userid) DO UPDATE SET
            status = 'active',
            updated_at = now()
          RETURNING id, name
        `,
        [input.tenantId, normalizedOpenUserid]
      );
      const member = memberResult.rows[0];
      if (!member || member.id === undefined) {
        throw new Error("failed to provision WeCom member identity");
      }

      const memberIdentityId = String(member.id);
      let accountId = await this.findBoundAccount(input.tenantId, memberIdentityId, tx);
      if (!accountId) {
        const accountResult = await tx.query<AccountRow>(
          `
            INSERT INTO accounts (status, created_at, updated_at)
            VALUES ('active', now(), now())
            RETURNING id
          `
        );
        const createdAccountId = accountResult.rows[0]?.id;
        if (createdAccountId === undefined) {
          throw new Error("failed to create account for WeCom member");
        }
        accountId = String(createdAccountId);
        await tx.query(
          `
            INSERT INTO account_identity_bindings (
              account_id,
              tenant_id,
              member_identity_id,
              bind_source,
              created_at
            )
            VALUES ($1, $2, $3, 'wecom_qy_login', now())
            ON CONFLICT (tenant_id, member_identity_id) DO NOTHING
          `,
          [accountId, input.tenantId, memberIdentityId]
        );
      }

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
        [accountId, memberIdentityId]
      );

      const publicId = defaultEmployeePublicId({ tenantId: input.tenantId, memberIdentityId });
      const card = await this.ensureDefaultCard({
        tenantId: input.tenantId,
        memberIdentityId,
        publicId,
        displayName: member.name || normalizedOpenUserid
      }, tx);

      return {
        accountId,
        tenantId: input.tenantId,
        tenantName: input.tenantName,
        memberIdentityId,
        displayName: member.name || normalizedOpenUserid,
        openUserid: normalizedOpenUserid,
        publicId: card.public_id
      };
    });
  }

  private provisionInMemory(input: ProvisionWecomEmployeeInput): ProvisionedWecomEmployee {
    const key = this.memoryKey(input.tenantId, input.openUserid);
    const current = this.memory.get(key);
    if (current) {
      return { ...current };
    }

    this.memorySequence += 1;
    const memberIdentityId = String(this.memorySequence);
    const record: MemoryEmployeeRecord = {
      accountId: String(this.memorySequence),
      tenantId: input.tenantId,
      tenantName: input.tenantName,
      memberIdentityId,
      displayName: input.openUserid,
      openUserid: input.openUserid,
      publicId: defaultEmployeePublicId({ tenantId: input.tenantId, memberIdentityId })
    };
    this.memory.set(key, record);
    return { ...record };
  }

  private async findBoundAccount(
    tenantId: string,
    memberIdentityId: string,
    tx: { query<T extends QueryResultRow = QueryResultRow>(text: string, values?: unknown[]): Promise<{ rows: T[] }> }
  ): Promise<string | null> {
    const bindingResult = await tx.query<BindingRow>(
      `
        SELECT account_id
        FROM account_identity_bindings
        WHERE tenant_id = $1 AND member_identity_id = $2
        LIMIT 1
      `,
      [tenantId, memberIdentityId]
    );
    const accountId = bindingResult.rows[0]?.account_id;
    return accountId === undefined ? null : String(accountId);
  }

  private async ensureDefaultCard(
    input: {
      tenantId: string;
      memberIdentityId: string;
      publicId: string;
      displayName: string;
    },
    tx: { query<T extends QueryResultRow = QueryResultRow>(text: string, values?: unknown[]): Promise<{ rows: T[] }> }
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

    const cardResult = await tx.query<CardRow>(
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
        JSON.stringify({
          show_mobile: false,
          show_email: true,
          show_wechat: false
        })
      ]
    );
    const card = cardResult.rows[0];
    if (!card || card.id === undefined || !card.public_id) {
      throw new Error("failed to create default WeCom employee card");
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
          tenant_id = EXCLUDED.tenant_id,
          card_id = EXCLUDED.card_id,
          status = 'active',
          card_updated_at = now(),
          updated_at = now()
      `,
      [card.public_id, input.tenantId, card.id]
    );
    return card;
  }

  private memoryKey(tenantId: string, openUserid: string): string {
    return `${tenantId}:${openUserid}`;
  }

  private hasDatabase(): boolean {
    return Boolean(process.env.DATABASE_URL?.trim());
  }
}
