import { Injectable } from "@nestjs/common";
import type { QueryResultRow } from "pg";
import { DatabaseService } from "../database/database.service.js";
import { WecomStateCipherService } from "./wecom-state-cipher.service.js";

export interface WecomSuiteTicketSnapshot {
  suiteId: string;
  suiteTicket: string;
  updatedAt: Date;
}

export interface WecomSuiteAccessTokenSnapshot {
  suiteId: string;
  accessToken: string;
  expiresAt: Date;
}

interface StoredSuiteState {
  suiteId: string;
  suiteTicketEncrypted: string | null;
  suiteTicketUpdatedAt: Date | null;
  suiteAccessTokenEncrypted: string | null;
  suiteAccessTokenExpiresAt: Date | null;
}

interface WecomSuiteStateRow extends QueryResultRow {
  suite_id: string;
  suite_ticket_encrypted: string | null;
  suite_ticket_updated_at: Date | string | null;
  suite_access_token_encrypted: string | null;
  suite_access_token_expires_at: Date | string | null;
}

@Injectable()
export class WecomSuiteStateRepository {
  private readonly memory = new Map<string, StoredSuiteState>();

  constructor(
    private readonly database: DatabaseService,
    private readonly cipher: WecomStateCipherService
  ) {}

  async saveSuiteTicket(
    suiteId: string,
    suiteTicket: string,
    updatedAt = new Date()
  ): Promise<WecomSuiteTicketSnapshot> {
    const encrypted = this.cipher.encrypt(suiteTicket);
    if (!this.hasDatabase()) {
      const current = this.memory.get(suiteId);
      if (current?.suiteTicketUpdatedAt && current.suiteTicketUpdatedAt > updatedAt) {
        const snapshot = this.storedToSnapshot(current);
        if (snapshot) {
          return snapshot;
        }
      }
      this.memory.set(suiteId, {
        ...current,
        suiteId,
        suiteTicketEncrypted: encrypted,
        suiteTicketUpdatedAt: updatedAt,
        suiteAccessTokenEncrypted: current?.suiteAccessTokenEncrypted ?? null,
        suiteAccessTokenExpiresAt: current?.suiteAccessTokenExpiresAt ?? null
      });
      return { suiteId, suiteTicket, updatedAt };
    }

    const result = await this.database.query<WecomSuiteStateRow>(
      `
        INSERT INTO wecom_suite_state (
          suite_id,
          suite_ticket_encrypted,
          suite_ticket_updated_at,
          created_at,
          updated_at
        )
        VALUES ($1, $2, $3, now(), now())
        ON CONFLICT (suite_id) DO UPDATE SET
          suite_ticket_encrypted = EXCLUDED.suite_ticket_encrypted,
          suite_ticket_updated_at = EXCLUDED.suite_ticket_updated_at,
          updated_at = now()
        WHERE wecom_suite_state.suite_ticket_updated_at IS NULL
          OR wecom_suite_state.suite_ticket_updated_at <= EXCLUDED.suite_ticket_updated_at
        RETURNING suite_id, suite_ticket_encrypted, suite_ticket_updated_at
      `,
      [suiteId, encrypted, updatedAt]
    );

    const snapshot = this.toSnapshot(result.rows[0]) ?? (await this.getSuiteTicket(suiteId));
    if (!snapshot) {
      throw new Error("failed to save WeCom suite ticket");
    }
    return snapshot;
  }

  async getSuiteTicket(suiteId: string): Promise<WecomSuiteTicketSnapshot | null> {
    if (!this.hasDatabase()) {
      const stored = this.memory.get(suiteId);
      const snapshot = stored ? this.storedToSnapshot(stored) : null;
      if (!snapshot) {
        return null;
      }
      return snapshot;
    }

    const result = await this.database.query<WecomSuiteStateRow>(
      `
        SELECT suite_id, suite_ticket_encrypted, suite_ticket_updated_at
        FROM wecom_suite_state
        WHERE suite_id = $1
      `,
      [suiteId]
    );
    return this.toSnapshot(result.rows[0]);
  }

  async saveSuiteAccessToken(
    suiteId: string,
    accessToken: string,
    expiresAt: Date
  ): Promise<WecomSuiteAccessTokenSnapshot> {
    const encrypted = this.cipher.encrypt(accessToken);
    if (!this.hasDatabase()) {
      const current = this.memory.get(suiteId);
      this.memory.set(suiteId, {
        suiteId,
        suiteTicketEncrypted: current?.suiteTicketEncrypted ?? null,
        suiteTicketUpdatedAt: current?.suiteTicketUpdatedAt ?? null,
        suiteAccessTokenEncrypted: encrypted,
        suiteAccessTokenExpiresAt: expiresAt
      });
      return { suiteId, accessToken, expiresAt };
    }

    const result = await this.database.query<WecomSuiteStateRow>(
      `
        INSERT INTO wecom_suite_state (
          suite_id,
          suite_access_token_encrypted,
          suite_access_token_expires_at,
          created_at,
          updated_at
        )
        VALUES ($1, $2, $3, now(), now())
        ON CONFLICT (suite_id) DO UPDATE SET
          suite_access_token_encrypted = EXCLUDED.suite_access_token_encrypted,
          suite_access_token_expires_at = EXCLUDED.suite_access_token_expires_at,
          updated_at = now()
        RETURNING suite_id, suite_access_token_encrypted, suite_access_token_expires_at
      `,
      [suiteId, encrypted, expiresAt]
    );

    const snapshot = this.toAccessTokenSnapshot(result.rows[0]);
    if (!snapshot) {
      throw new Error("failed to save WeCom suite access token");
    }
    return snapshot;
  }

  async getSuiteAccessToken(suiteId: string): Promise<WecomSuiteAccessTokenSnapshot | null> {
    if (!this.hasDatabase()) {
      const stored = this.memory.get(suiteId);
      if (!stored?.suiteAccessTokenEncrypted || !stored.suiteAccessTokenExpiresAt) {
        return null;
      }
      return {
        suiteId: stored.suiteId,
        accessToken: this.cipher.decrypt(stored.suiteAccessTokenEncrypted),
        expiresAt: stored.suiteAccessTokenExpiresAt
      };
    }

    const result = await this.database.query<WecomSuiteStateRow>(
      `
        SELECT suite_id, suite_access_token_encrypted, suite_access_token_expires_at
        FROM wecom_suite_state
        WHERE suite_id = $1
      `,
      [suiteId]
    );
    return this.toAccessTokenSnapshot(result.rows[0]);
  }

  private toSnapshot(row: WecomSuiteStateRow | undefined): WecomSuiteTicketSnapshot | null {
    if (!row?.suite_ticket_encrypted || !row.suite_ticket_updated_at) {
      return null;
    }
    return {
      suiteId: row.suite_id,
      suiteTicket: this.cipher.decrypt(row.suite_ticket_encrypted),
      updatedAt: new Date(row.suite_ticket_updated_at)
    };
  }

  private toAccessTokenSnapshot(row: WecomSuiteStateRow | undefined): WecomSuiteAccessTokenSnapshot | null {
    if (!row?.suite_access_token_encrypted || !row.suite_access_token_expires_at) {
      return null;
    }
    return {
      suiteId: row.suite_id,
      accessToken: this.cipher.decrypt(row.suite_access_token_encrypted),
      expiresAt: new Date(row.suite_access_token_expires_at)
    };
  }

  private storedToSnapshot(stored: StoredSuiteState): WecomSuiteTicketSnapshot | null {
    if (!stored.suiteTicketEncrypted || !stored.suiteTicketUpdatedAt) {
      return null;
    }
    return {
      suiteId: stored.suiteId,
      suiteTicket: this.cipher.decrypt(stored.suiteTicketEncrypted),
      updatedAt: stored.suiteTicketUpdatedAt
    };
  }

  private hasDatabase(): boolean {
    return Boolean(process.env.DATABASE_URL?.trim());
  }
}
