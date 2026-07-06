import { Injectable } from "@nestjs/common";
import type { QueryResultRow } from "pg";
import { DatabaseService } from "../database/database.service.js";
import { WecomStateCipherService } from "./wecom-state-cipher.service.js";

export interface SaveTenantAuthorizationInput {
  openCorpid: string;
  corpName: string;
  permanentCode: string;
  agentId: string | null;
  authInfo: unknown;
  authorizedAt: Date;
}

export interface TenantAuthorizationSnapshot {
  tenantId: string;
  openCorpid: string;
  corpName: string;
  permanentCode: string;
  agentId: string | null;
  authStatus: "active";
}

export interface WecomCorpAccessTokenSnapshot {
  openCorpid: string;
  accessToken: string;
  expiresAt: Date;
}

interface StoredTenantAuthorization {
  tenantId: string;
  openCorpid: string;
  corpName: string;
  agentId: string | null;
  authInfo: unknown;
  authorizedAt: Date;
  permanentCodeEncrypted: string;
  corpAccessTokenEncrypted: string | null;
  corpAccessTokenExpiresAt: Date | null;
}

interface TenantAuthorizationRow extends QueryResultRow {
  id: string | number | bigint;
  open_corpid: string;
  name: string;
  permanent_code_encrypted: string | null;
  agent_id: string | null;
  auth_status: "active";
  corp_access_token_encrypted: string | null;
  corp_access_token_expires_at: Date | string | null;
}

@Injectable()
export class WecomTenantAuthRepository {
  private readonly memory = new Map<string, StoredTenantAuthorization>();

  constructor(
    private readonly database: DatabaseService,
    private readonly cipher: WecomStateCipherService
  ) {}

  async saveAuthorization(input: SaveTenantAuthorizationInput): Promise<TenantAuthorizationSnapshot> {
    const encrypted = this.cipher.encrypt(input.permanentCode);
    if (!this.hasDatabase()) {
      const current = this.memory.get(input.openCorpid);
      const stored: StoredTenantAuthorization = {
        openCorpid: input.openCorpid,
        corpName: input.corpName,
        agentId: input.agentId,
        authInfo: input.authInfo,
        authorizedAt: input.authorizedAt,
        tenantId: current?.tenantId ?? String(this.memory.size + 1),
        permanentCodeEncrypted: encrypted,
        corpAccessTokenEncrypted: current?.corpAccessTokenEncrypted ?? null,
        corpAccessTokenExpiresAt: current?.corpAccessTokenExpiresAt ?? null
      };
      this.memory.set(input.openCorpid, stored);
      return this.storedToSnapshot(stored);
    }

    const result = await this.database.query<TenantAuthorizationRow>(
      `
        INSERT INTO tenants (
          name,
          open_corpid,
          auth_status,
          permanent_code_encrypted,
          agent_id,
          auth_scope_json,
          authorized_at,
          created_at,
          updated_at
        )
        VALUES ($1, $2, 'active', $3, $4, $5, $6, now(), now())
        ON CONFLICT (open_corpid) DO UPDATE SET
          name = EXCLUDED.name,
          auth_status = 'active',
          permanent_code_encrypted = EXCLUDED.permanent_code_encrypted,
          agent_id = EXCLUDED.agent_id,
          auth_scope_json = EXCLUDED.auth_scope_json,
          authorized_at = EXCLUDED.authorized_at,
          updated_at = now()
        RETURNING id, open_corpid, name, permanent_code_encrypted, agent_id, auth_status
      `,
      [
        input.corpName,
        input.openCorpid,
        encrypted,
        input.agentId,
        JSON.stringify(input.authInfo ?? null),
        input.authorizedAt
      ]
    );

    const snapshot = this.rowToSnapshot(result.rows[0]);
    if (!snapshot) {
      throw new Error("failed to save WeCom tenant authorization");
    }
    return snapshot;
  }

  async getByOpenCorpid(openCorpid: string): Promise<TenantAuthorizationSnapshot | null> {
    if (!this.hasDatabase()) {
      const stored = this.memory.get(openCorpid);
      return stored ? this.storedToSnapshot(stored) : null;
    }

    const result = await this.database.query<TenantAuthorizationRow>(
      `
        SELECT id, open_corpid, name, permanent_code_encrypted, agent_id, auth_status
        FROM tenants
        WHERE open_corpid = $1
      `,
      [openCorpid]
    );
    return this.rowToSnapshot(result.rows[0]);
  }

  async saveCorpAccessToken(
    openCorpid: string,
    accessToken: string,
    expiresAt: Date
  ): Promise<WecomCorpAccessTokenSnapshot> {
    const encrypted = this.cipher.encrypt(accessToken);
    if (!this.hasDatabase()) {
      const current = this.memory.get(openCorpid);
      if (!current) {
        throw new Error("cannot save WeCom corp access token before tenant authorization");
      }
      this.memory.set(openCorpid, {
        ...current,
        corpAccessTokenEncrypted: encrypted,
        corpAccessTokenExpiresAt: expiresAt
      });
      return { openCorpid, accessToken, expiresAt };
    }

    const result = await this.database.query<TenantAuthorizationRow>(
      `
        UPDATE tenants
        SET corp_access_token_encrypted = $2,
            corp_access_token_expires_at = $3,
            updated_at = now()
        WHERE open_corpid = $1
        RETURNING open_corpid, corp_access_token_encrypted, corp_access_token_expires_at
      `,
      [openCorpid, encrypted, expiresAt]
    );
    const snapshot = this.rowToCorpTokenSnapshot(result.rows[0]);
    if (!snapshot) {
      throw new Error("failed to save WeCom corp access token");
    }
    return snapshot;
  }

  async getCorpAccessToken(openCorpid: string): Promise<WecomCorpAccessTokenSnapshot | null> {
    if (!this.hasDatabase()) {
      const stored = this.memory.get(openCorpid);
      if (!stored?.corpAccessTokenEncrypted || !stored.corpAccessTokenExpiresAt) {
        return null;
      }
      return {
        openCorpid: stored.openCorpid,
        accessToken: this.cipher.decrypt(stored.corpAccessTokenEncrypted),
        expiresAt: stored.corpAccessTokenExpiresAt
      };
    }

    const result = await this.database.query<TenantAuthorizationRow>(
      `
        SELECT open_corpid, corp_access_token_encrypted, corp_access_token_expires_at
        FROM tenants
        WHERE open_corpid = $1
      `,
      [openCorpid]
    );
    return this.rowToCorpTokenSnapshot(result.rows[0]);
  }

  private storedToSnapshot(stored: StoredTenantAuthorization): TenantAuthorizationSnapshot {
    return {
      tenantId: stored.tenantId,
      openCorpid: stored.openCorpid,
      corpName: stored.corpName,
      permanentCode: this.cipher.decrypt(stored.permanentCodeEncrypted),
      agentId: stored.agentId,
      authStatus: "active"
    };
  }

  private rowToSnapshot(row: TenantAuthorizationRow | undefined): TenantAuthorizationSnapshot | null {
    if (!row?.permanent_code_encrypted) {
      return null;
    }
    return {
      tenantId: String(row.id),
      openCorpid: row.open_corpid,
      corpName: row.name,
      permanentCode: this.cipher.decrypt(row.permanent_code_encrypted),
      agentId: row.agent_id,
      authStatus: "active"
    };
  }

  private rowToCorpTokenSnapshot(row: TenantAuthorizationRow | undefined): WecomCorpAccessTokenSnapshot | null {
    if (!row?.corp_access_token_encrypted || !row.corp_access_token_expires_at) {
      return null;
    }
    return {
      openCorpid: row.open_corpid,
      accessToken: this.cipher.decrypt(row.corp_access_token_encrypted),
      expiresAt: new Date(row.corp_access_token_expires_at)
    };
  }

  private hasDatabase(): boolean {
    return Boolean(process.env.DATABASE_URL?.trim());
  }
}
