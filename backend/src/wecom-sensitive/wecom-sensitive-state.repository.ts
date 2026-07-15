import { createHash } from "node:crypto";
import { Injectable } from "@nestjs/common";
import type { QueryResultRow } from "pg";
import { DatabaseService } from "../database/database.service.js";

export interface SensitiveStateContext {
  tenantId: string;
  memberIdentityId: string;
  openCorpid: string;
  openUseridHash: string;
}

interface StateRow extends QueryResultRow {
  tenant_id: string | number | bigint;
  member_identity_id: string | number | bigint;
  open_corpid: string;
  open_userid_hash: string;
}

@Injectable()
export class WecomSensitiveStateRepository {
  private readonly memory = new Map<string, SensitiveStateContext & { expiresAt: number }>();

  constructor(private readonly database: DatabaseService) {}

  async create(state: string, context: SensitiveStateContext, expiresAt: Date): Promise<void> {
    const stateHash = hash(state);
    if (!this.hasDatabase()) {
      this.memory.set(stateHash, { ...context, expiresAt: expiresAt.getTime() });
      return;
    }
    await this.database.query(
      `INSERT INTO wecom_sensitive_auth_states
         (state_hash, tenant_id, member_identity_id, open_corpid, open_userid_hash, expires_at, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, now())
       ON CONFLICT (state_hash) DO NOTHING`,
      [stateHash, context.tenantId, context.memberIdentityId, context.openCorpid, context.openUseridHash, expiresAt]
    );
  }

  async consume(state: string): Promise<SensitiveStateContext | null> {
    const stateHash = hash(state);
    if (!this.hasDatabase()) {
      const current = this.memory.get(stateHash);
      this.memory.delete(stateHash);
      if (!current || current.expiresAt <= Date.now()) return null;
      const { expiresAt: _expiresAt, ...context } = current;
      return context;
    }
    const result = await this.database.query<StateRow>(
      `UPDATE wecom_sensitive_auth_states
       SET consumed_at = now()
       WHERE state_hash = $1 AND consumed_at IS NULL AND expires_at > now()
       RETURNING tenant_id, member_identity_id, open_corpid, open_userid_hash`,
      [stateHash]
    );
    const row = result.rows[0];
    return row
      ? {
          tenantId: String(row.tenant_id),
          memberIdentityId: String(row.member_identity_id),
          openCorpid: row.open_corpid,
          openUseridHash: row.open_userid_hash
        }
      : null;
  }

  private hasDatabase(): boolean {
    return Boolean(process.env.DATABASE_URL?.trim());
  }
}

export function hashSensitiveIdentity(value: string): string {
  return hash(value.trim());
}

function hash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
