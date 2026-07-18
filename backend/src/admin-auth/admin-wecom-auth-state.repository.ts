import { createHash } from "node:crypto";
import { Injectable, Optional } from "@nestjs/common";
import type { QueryResultRow } from "pg";
import { DatabaseService } from "../database/database.service.js";

export interface AdminWecomAuthStateContext {
  accountType: "tenant";
  redirectPath: string | null;
}

interface StateRow extends QueryResultRow {
  account_type: "tenant";
  redirect_path: string | null;
}

@Injectable()
export class AdminWecomAuthStateRepository {
  private readonly memory = new Map<string, AdminWecomAuthStateContext & { expiresAt: number; usedAt: number | null }>();

  constructor(@Optional() private readonly database?: DatabaseService) {}

  async create(input: {
    state: string;
    context: AdminWecomAuthStateContext;
    expiresAt: Date;
    clientIp: string | null;
    userAgent: string | null;
  }): Promise<void> {
    const stateHash = hashState(input.state);
    if (!this.hasDatabase()) {
      this.memory.set(stateHash, { ...input.context, expiresAt: input.expiresAt.getTime(), usedAt: null });
      return;
    }
    await this.database!.query(
      `
        INSERT INTO admin_auth_states (
          state_hash, account_type, redirect_path, expires_at, used_at, client_ip, user_agent, created_at
        )
        VALUES ($1, $2, $3, $4, NULL, $5, $6, now())
        ON CONFLICT (state_hash) DO NOTHING
      `,
      [
        stateHash,
        input.context.accountType,
        input.context.redirectPath,
        input.expiresAt,
        input.clientIp,
        input.userAgent
      ]
    );
  }

  async consume(state: string): Promise<AdminWecomAuthStateContext | null> {
    const stateHash = hashState(state);
    if (!this.hasDatabase()) {
      const current = this.memory.get(stateHash);
      if (!current || current.usedAt !== null || current.expiresAt <= Date.now()) {
        return null;
      }
      this.memory.set(stateHash, { ...current, usedAt: Date.now() });
      return { accountType: current.accountType, redirectPath: current.redirectPath };
    }
    const result = await this.database!.query<StateRow>(
      `
        UPDATE admin_auth_states
        SET used_at = now()
        WHERE state_hash = $1 AND used_at IS NULL AND expires_at > now()
        RETURNING account_type, redirect_path
      `,
      [stateHash]
    );
    const row = result.rows[0];
    return row ? { accountType: row.account_type, redirectPath: row.redirect_path } : null;
  }

  private hasDatabase(): boolean {
    return Boolean(this.database && process.env.DATABASE_URL?.trim());
  }
}

function hashState(state: string): string {
  return createHash("sha256").update(state).digest("hex");
}
