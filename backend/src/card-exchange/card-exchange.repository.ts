import { ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import type { QueryResultRow } from "pg";
import { randomToken } from "../common/id.js";
import type {
  ExchangeCardSnapshot,
  ExchangeListResponse,
  ExchangeMutationResponse,
  ExchangeRequestItem
} from "../contracts/card-exchange.js";
import { DatabaseService, type DatabaseTransaction } from "../database/database.service.js";
import type { EmployeeSession } from "../session/employee-session.js";

interface ExchangeRow extends QueryResultRow {
  request_id: string;
  sender_account_id: string;
  sender_tenant_id: string;
  sender_member_identity_id: string;
  sender_card_snapshot: ExchangeCardSnapshot;
  recipient_account_id: string;
  recipient_tenant_id: string;
  recipient_member_identity_id: string;
  recipient_card_snapshot: ExchangeCardSnapshot;
  source_visit_id: string;
  status: "pending" | "accepted" | "ignored";
  recipient_read_at: Date | string | null;
  responded_at: Date | string | null;
  created_at: Date | string;
}

@Injectable()
export class CardExchangeRepository {
  private readonly memory = new Map<string, ExchangeRow>();

  constructor(private readonly database: DatabaseService) {}

  async create(
    session: EmployeeSession,
    sender: ExchangeCardSnapshot,
    recipient: ExchangeCardSnapshot,
    sourceVisitId: string
  ): Promise<ExchangeMutationResponse> {
    if (!this.database.isConfigured()) {
      return this.createInMemory(session, sender, recipient, sourceVisitId);
    }
    return this.database.transaction(async (tx) => {
      const senderMeta = await this.resolveOwnedCard(tx, session, sender.public_id);
      const recipientMeta = await this.resolveRecipient(tx, recipient.public_id);
      if (senderMeta.memberIdentityId === recipientMeta.memberIdentityId && senderMeta.tenantId === recipientMeta.tenantId) {
        throw new ConflictException("cannot exchange with your own card");
      }

      const existing = await tx.query<ExchangeRow>(
        `SELECT * FROM card_exchange_requests
         WHERE sender_account_id=$1 AND sender_member_identity_id=$2
           AND recipient_account_id=$3 AND recipient_member_identity_id=$4 AND status='pending'
         LIMIT 1`,
        [session.accountId, session.memberIdentityId, recipientMeta.accountId, recipientMeta.memberIdentityId]
      );
      if (existing.rows[0]) return { request: this.toItem(existing.rows[0], session), idempotent: true };

      const inserted = await tx.query<ExchangeRow>(
        `INSERT INTO card_exchange_requests (
           request_id, sender_account_id, sender_tenant_id, sender_member_identity_id, sender_card_id,
           sender_card_snapshot, recipient_account_id, recipient_tenant_id, recipient_member_identity_id,
           recipient_card_id, recipient_card_snapshot, source_visit_id
         ) VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,$10,$11::jsonb,$12)
         ON CONFLICT (sender_member_identity_id, recipient_member_identity_id) WHERE status='pending'
         DO NOTHING RETURNING *`,
        [
          randomToken("exr", 18), session.accountId, senderMeta.tenantId, senderMeta.memberIdentityId, senderMeta.cardId,
          JSON.stringify(sender), recipientMeta.accountId, recipientMeta.tenantId, recipientMeta.memberIdentityId,
          recipientMeta.cardId, JSON.stringify(recipient), sourceVisitId
        ]
      );
      if (inserted.rows[0]) return { request: this.toItem(inserted.rows[0], session), idempotent: false };
      const raced = await tx.query<ExchangeRow>(
        `SELECT * FROM card_exchange_requests
         WHERE sender_account_id=$1 AND sender_member_identity_id=$2
           AND recipient_account_id=$3 AND recipient_member_identity_id=$4 AND status='pending'
         LIMIT 1`,
        [session.accountId, session.memberIdentityId, recipientMeta.accountId, recipientMeta.memberIdentityId]
      );
      if (!raced.rows[0]) throw new ConflictException("exchange request could not be created");
      return { request: this.toItem(raced.rows[0], session), idempotent: true };
    });
  }

  async list(session: EmployeeSession): Promise<ExchangeListResponse> {
    const rows = this.database.isConfigured()
      ? (await this.database.query<ExchangeRow>(
          `SELECT * FROM card_exchange_requests
           WHERE (recipient_account_id=$1 AND recipient_member_identity_id=$2)
              OR (sender_account_id=$1 AND sender_member_identity_id=$2)
           ORDER BY CASE WHEN recipient_account_id=$1 AND status='pending' THEN 0 ELSE 1 END, created_at DESC
           LIMIT 100`,
          [session.accountId, session.memberIdentityId]
        )).rows
      : [...this.memory.values()].filter((row) => this.isParticipant(row, session));
    const requests = rows.map((row) => this.toItem(row, session));
    return {
      unread_count: requests.filter((item) => item.direction === "incoming" && item.unread).length,
      pending_count: requests.filter((item) => item.direction === "incoming" && item.status === "pending").length,
      requests
    };
  }

  async markIncomingRead(session: EmployeeSession): Promise<{ updated: number }> {
    if (!this.database.isConfigured()) {
      let updated = 0;
      for (const row of this.memory.values()) {
        if (this.isRecipient(row, session) && !row.recipient_read_at) {
          row.recipient_read_at = new Date();
          updated += 1;
        }
      }
      return { updated };
    }
    const result = await this.database.query(
      `UPDATE card_exchange_requests SET recipient_read_at=now(), updated_at=now()
       WHERE recipient_account_id=$1 AND recipient_member_identity_id=$2
         AND status='pending' AND recipient_read_at IS NULL`,
      [session.accountId, session.memberIdentityId]
    );
    return { updated: result.rowCount ?? 0 };
  }

  async respond(
    session: EmployeeSession,
    requestId: string,
    status: "accepted" | "ignored"
  ): Promise<ExchangeMutationResponse> {
    if (!this.database.isConfigured()) {
      const row = this.memory.get(requestId);
      if (!row) throw new NotFoundException("exchange request not found");
      if (!this.isRecipient(row, session)) throw new ForbiddenException("exchange request does not belong to current identity");
      const idempotent = row.status === status;
      if (row.status === "pending") {
        row.status = status;
        row.recipient_read_at = new Date();
        row.responded_at = new Date();
      } else if (!idempotent) {
        throw new ConflictException("exchange request has already been resolved");
      }
      return { request: this.toItem(row, session), idempotent };
    }
    return this.database.transaction(async (tx) => {
      const current = await tx.query<ExchangeRow>(
        `SELECT * FROM card_exchange_requests
         WHERE request_id=$1 AND recipient_account_id=$2 AND recipient_member_identity_id=$3 FOR UPDATE`,
        [requestId, session.accountId, session.memberIdentityId]
      );
      const row = current.rows[0];
      if (!row) throw new NotFoundException("exchange request not found");
      if (row.status === status) return { request: this.toItem(row, session), idempotent: true };
      if (row.status !== "pending") throw new ConflictException("exchange request has already been resolved");
      const updated = await tx.query<ExchangeRow>(
        `UPDATE card_exchange_requests
         SET status=$2, recipient_read_at=COALESCE(recipient_read_at,now()), responded_at=now(), updated_at=now()
         WHERE request_id=$1 AND status='pending' RETURNING *`,
        [requestId, status]
      );
      return { request: this.toItem(updated.rows[0]!, session), idempotent: false };
    });
  }

  private async resolveOwnedCard(tx: DatabaseTransaction, session: EmployeeSession, publicId: string) {
    await this.setContext(tx, session.accountId, session.tenantId);
    const result = await tx.query<{ card_id: string; tenant_id: string; member_identity_id: string }>(
      `SELECT id AS card_id, tenant_id, member_identity_id FROM cards
       WHERE public_id=$1 AND tenant_id=$2 AND member_identity_id=$3 AND status='active'`,
      [publicId, session.tenantId, session.memberIdentityId]
    );
    if (!result.rows[0]) throw new ForbiddenException("sender card does not belong to current identity");
    return { cardId: result.rows[0].card_id, tenantId: result.rows[0].tenant_id, memberIdentityId: result.rows[0].member_identity_id };
  }

  private async resolveRecipient(tx: DatabaseTransaction, publicId: string) {
    const directory = await tx.query<{ tenant_id: string; card_id: string }>(
      "SELECT tenant_id, card_id FROM public_card_directory WHERE public_id=$1 AND status='active'",
      [publicId]
    );
    if (!directory.rows[0]) throw new NotFoundException("recipient card not found");
    await this.setContext(tx, "0", directory.rows[0].tenant_id);
    const result = await tx.query<{ account_id: string; tenant_id: string; card_id: string; member_identity_id: string }>(
      `SELECT bindings.account_id, cards.tenant_id, cards.id AS card_id, cards.member_identity_id
       FROM cards JOIN account_identity_bindings bindings
         ON bindings.tenant_id=cards.tenant_id AND bindings.member_identity_id=cards.member_identity_id
       WHERE cards.tenant_id=$1 AND cards.id=$2 AND cards.status='active'
       ORDER BY bindings.created_at ASC LIMIT 1`,
      [directory.rows[0].tenant_id, directory.rows[0].card_id]
    );
    if (!result.rows[0]) throw new NotFoundException("recipient identity not found");
    return { accountId: result.rows[0].account_id, tenantId: result.rows[0].tenant_id, cardId: result.rows[0].card_id, memberIdentityId: result.rows[0].member_identity_id };
  }

  private setContext(tx: DatabaseTransaction, accountId: string, tenantId: string) {
    return tx.query("SELECT set_config('app.account_id',$1,true), set_config('app.tenant_id',$2,true)", [accountId, tenantId]);
  }

  private createInMemory(session: EmployeeSession, sender: ExchangeCardSnapshot, recipient: ExchangeCardSnapshot, sourceVisitId: string) {
    if (sender.public_id === recipient.public_id) throw new ConflictException("cannot exchange with your own card");
    const existing = [...this.memory.values()].find((row) =>
      row.sender_account_id === session.accountId && row.sender_member_identity_id === session.memberIdentityId &&
      row.recipient_card_snapshot.public_id === recipient.public_id && row.status === "pending"
    );
    if (existing) return { request: this.toItem(existing, session), idempotent: true };
    const requestId = randomToken("exr", 18);
    const now = new Date();
    const row: ExchangeRow = {
      request_id: requestId, sender_account_id: session.accountId, sender_tenant_id: session.tenantId,
      sender_member_identity_id: session.memberIdentityId, sender_card_snapshot: sender,
      recipient_account_id: `owner:${recipient.public_id}`, recipient_tenant_id: `tenant:${recipient.public_id}`,
      recipient_member_identity_id: `identity:${recipient.public_id}`, recipient_card_snapshot: recipient,
      source_visit_id: sourceVisitId, status: "pending", recipient_read_at: null, responded_at: null, created_at: now
    };
    this.memory.set(requestId, row);
    return { request: this.toItem(row, session), idempotent: false };
  }

  private isParticipant(row: ExchangeRow, session: EmployeeSession) {
    return this.isRecipient(row, session) || (row.sender_account_id === session.accountId && row.sender_member_identity_id === session.memberIdentityId);
  }

  private isRecipient(row: ExchangeRow, session: EmployeeSession) {
    return row.recipient_account_id === session.accountId && row.recipient_member_identity_id === session.memberIdentityId;
  }

  private toItem(row: ExchangeRow, session: EmployeeSession): ExchangeRequestItem {
    const incoming = this.isRecipient(row, session);
    return {
      request_id: row.request_id,
      direction: incoming ? "incoming" : "outgoing",
      status: row.status,
      unread: incoming && row.status === "pending" && !row.recipient_read_at,
      counterpart: incoming ? row.sender_card_snapshot : row.recipient_card_snapshot,
      created_at: new Date(row.created_at).toISOString(),
      responded_at: row.responded_at ? new Date(row.responded_at).toISOString() : null
    };
  }
}
