import { ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import type { QueryResultRow } from "pg";
import { randomToken } from "../common/id.js";
import type {
  ExchangeCardSnapshot,
  ExchangeListQuery,
  ExchangeListResponse,
  ExchangeMutationResponse,
  ExchangeRequestItem
} from "../contracts/card-exchange.js";
import type { z } from "zod";
import { exchangeNotificationEventSchema } from "../contracts/card-exchange.js";
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
  status: "pending" | "accepted" | "ignored" | "withdrawn";
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

      const pairKey = [
        `${senderMeta.tenantId}/${senderMeta.memberIdentityId}`,
        `${recipientMeta.tenantId}/${recipientMeta.memberIdentityId}`
      ].sort().join(":");
      await tx.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [pairKey]);

      const accepted = await tx.query<ExchangeRow>(
        `SELECT * FROM card_exchange_requests
         WHERE status='accepted' AND (
           (sender_account_id=$1 AND sender_member_identity_id=$2 AND recipient_account_id=$3 AND recipient_member_identity_id=$4)
           OR
           (sender_account_id=$3 AND sender_member_identity_id=$4 AND recipient_account_id=$1 AND recipient_member_identity_id=$2)
         )
         ORDER BY responded_at DESC NULLS LAST LIMIT 1`,
        [session.accountId, session.memberIdentityId, recipientMeta.accountId, recipientMeta.memberIdentityId]
      );
      if (accepted.rows[0]) return { request: this.toItem(accepted.rows[0], session), idempotent: true, auto_accepted: false };

      const existing = await tx.query<ExchangeRow>(
        `SELECT * FROM card_exchange_requests
         WHERE sender_account_id=$1 AND sender_member_identity_id=$2
           AND recipient_account_id=$3 AND recipient_member_identity_id=$4 AND status='pending'
         LIMIT 1`,
        [session.accountId, session.memberIdentityId, recipientMeta.accountId, recipientMeta.memberIdentityId]
      );
      if (existing.rows[0]) return { request: this.toItem(existing.rows[0], session), idempotent: true, auto_accepted: false };

      const reverse = await tx.query<ExchangeRow>(
        `UPDATE card_exchange_requests SET status='accepted', recipient_read_at=COALESCE(recipient_read_at,now()),
           responded_at=now(), updated_at=now()
         WHERE sender_account_id=$1 AND sender_member_identity_id=$2
           AND recipient_account_id=$3 AND recipient_member_identity_id=$4 AND status='pending'
         RETURNING *`,
        [recipientMeta.accountId, recipientMeta.memberIdentityId, session.accountId, session.memberIdentityId]
      );
      if (reverse.rows[0]) return { request: this.toItem(reverse.rows[0], session), idempotent: false, auto_accepted: true };

      const cooldown = await tx.query<{ retry_at: Date | string }>(
        `SELECT responded_at + interval '7 days' AS retry_at FROM card_exchange_requests
         WHERE sender_account_id=$1 AND sender_member_identity_id=$2
           AND recipient_account_id=$3 AND recipient_member_identity_id=$4 AND status='ignored'
           AND responded_at > now() - interval '7 days'
         ORDER BY responded_at DESC LIMIT 1`,
        [session.accountId, session.memberIdentityId, recipientMeta.accountId, recipientMeta.memberIdentityId]
      );
      if (cooldown.rows[0]) {
        throw new ConflictException(`exchange request cooling down until ${new Date(cooldown.rows[0].retry_at).toISOString()}`);
      }

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
      if (inserted.rows[0]) return { request: this.toItem(inserted.rows[0], session), idempotent: false, auto_accepted: false };
      const raced = await tx.query<ExchangeRow>(
        `SELECT * FROM card_exchange_requests
         WHERE sender_account_id=$1 AND sender_member_identity_id=$2
           AND recipient_account_id=$3 AND recipient_member_identity_id=$4 AND status='pending'
         LIMIT 1`,
        [session.accountId, session.memberIdentityId, recipientMeta.accountId, recipientMeta.memberIdentityId]
      );
      if (!raced.rows[0]) throw new ConflictException("exchange request could not be created");
      return { request: this.toItem(raced.rows[0], session), idempotent: true, auto_accepted: false };
    });
  }

  async list(
    session: EmployeeSession,
    query: ExchangeListQuery = { limit: 50, offset: 0 }
  ): Promise<Omit<ExchangeListResponse, "notification_template_id">> {
    let rows: ExchangeRow[];
    let unreadCount: number;
    let pendingCount: number;
    let acceptedCount: number;
    let total: number;
    if (this.database.isConfigured()) {
      const [countResult, rowResult] = await Promise.all([
        this.database.query<{ unread_count: string; pending_count: string; accepted_count: string; total: string }>(
          `SELECT
             COUNT(*) FILTER (WHERE recipient_account_id=$1 AND status='pending' AND recipient_read_at IS NULL) AS unread_count,
             COUNT(*) FILTER (WHERE recipient_account_id=$1 AND status='pending') AS pending_count,
             COUNT(*) FILTER (WHERE status='accepted') AS accepted_count,
             COUNT(*) AS total
           FROM card_exchange_requests
           WHERE status IN ('pending','accepted') AND (
             (recipient_account_id=$1 AND recipient_member_identity_id=$2)
             OR (sender_account_id=$1 AND sender_member_identity_id=$2)
           )`,
          [session.accountId, session.memberIdentityId]
        ),
        this.database.query<ExchangeRow>(
          `SELECT * FROM card_exchange_requests
           WHERE status IN ('pending','accepted') AND (
             (recipient_account_id=$1 AND recipient_member_identity_id=$2)
             OR (sender_account_id=$1 AND sender_member_identity_id=$2)
           )
           ORDER BY CASE WHEN recipient_account_id=$1 AND status='pending' THEN 0 ELSE 1 END, created_at DESC, request_id DESC
           LIMIT $3 OFFSET $4`,
          [session.accountId, session.memberIdentityId, query.limit, query.offset]
        )
      ]);
      const counts = countResult.rows[0]!;
      rows = rowResult.rows;
      unreadCount = Number(counts.unread_count);
      pendingCount = Number(counts.pending_count);
      acceptedCount = Number(counts.accepted_count);
      total = Number(counts.total);
    } else {
      const all = [...this.memory.values()]
        .filter((row) => this.isParticipant(row, session) && (row.status === "pending" || row.status === "accepted"))
        .sort((left, right) => {
          const leftPriority = this.isRecipient(left, session) && left.status === "pending" ? 0 : 1;
          const rightPriority = this.isRecipient(right, session) && right.status === "pending" ? 0 : 1;
          return leftPriority - rightPriority || new Date(right.created_at).getTime() - new Date(left.created_at).getTime();
        });
      total = all.length;
      unreadCount = all.filter((row) => this.isRecipient(row, session) && row.status === "pending" && !row.recipient_read_at).length;
      pendingCount = all.filter((row) => this.isRecipient(row, session) && row.status === "pending").length;
      acceptedCount = all.filter((row) => row.status === "accepted").length;
      rows = all.slice(query.offset, query.offset + query.limit);
    }
    const requests = rows.map((row) => this.toItem(row, session));
    const nextOffset = query.offset + requests.length;
    return {
      unread_count: unreadCount,
      pending_count: pendingCount,
      accepted_count: acceptedCount,
      requests,
      next_offset: nextOffset < total ? nextOffset : null
    };
  }

  async relationship(session: EmployeeSession, counterpartPublicId: string): Promise<{ request: ExchangeRequestItem | null }> {
    const row = this.database.isConfigured()
      ? (await this.database.query<ExchangeRow>(
          `SELECT * FROM card_exchange_requests
           WHERE status IN ('pending','accepted') AND (
             (sender_account_id=$1 AND sender_member_identity_id=$2 AND recipient_card_snapshot->>'public_id'=$3)
             OR (recipient_account_id=$1 AND recipient_member_identity_id=$2 AND sender_card_snapshot->>'public_id'=$3)
           )
           ORDER BY CASE WHEN status='accepted' THEN 0 ELSE 1 END, created_at DESC LIMIT 1`,
          [session.accountId, session.memberIdentityId, counterpartPublicId]
        )).rows[0]
      : [...this.memory.values()]
          .filter((candidate) =>
            this.isParticipant(candidate, session) &&
            (candidate.status === "pending" || candidate.status === "accepted") &&
            (this.isRecipient(candidate, session) ? candidate.sender_card_snapshot.public_id : candidate.recipient_card_snapshot.public_id) === counterpartPublicId
          )
          .sort((left, right) => Number(right.status === "accepted") - Number(left.status === "accepted"))[0];
    return { request: row ? this.toItem(row, session) : null };
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
      return { request: this.toItem(row, session), idempotent, auto_accepted: false };
    }
    return this.database.transaction(async (tx) => {
      const current = await tx.query<ExchangeRow>(
        `SELECT * FROM card_exchange_requests
         WHERE request_id=$1 AND recipient_account_id=$2 AND recipient_member_identity_id=$3 FOR UPDATE`,
        [requestId, session.accountId, session.memberIdentityId]
      );
      const row = current.rows[0];
      if (!row) throw new NotFoundException("exchange request not found");
      if (row.status === status) return { request: this.toItem(row, session), idempotent: true, auto_accepted: false };
      if (row.status !== "pending") throw new ConflictException("exchange request has already been resolved");
      const updated = await tx.query<ExchangeRow>(
        `UPDATE card_exchange_requests
         SET status=$2, recipient_read_at=COALESCE(recipient_read_at,now()), responded_at=now(), updated_at=now()
         WHERE request_id=$1 AND status='pending' RETURNING *`,
        [requestId, status]
      );
      return { request: this.toItem(updated.rows[0]!, session), idempotent: false, auto_accepted: false };
    });
  }

  async withdraw(session: EmployeeSession, requestId: string): Promise<ExchangeMutationResponse> {
    if (!this.database.isConfigured()) {
      const row = this.memory.get(requestId);
      if (!row || row.sender_account_id !== session.accountId || row.sender_member_identity_id !== session.memberIdentityId) {
        throw new NotFoundException("exchange request not found");
      }
      const idempotent = row.status === "withdrawn";
      if (row.status === "pending") {
        row.status = "withdrawn";
        row.responded_at = new Date();
      } else if (!idempotent) {
        throw new ConflictException("exchange request has already been resolved");
      }
      return { request: this.toItem(row, session), idempotent, auto_accepted: false };
    }
    return this.database.transaction(async (tx) => {
      const current = await tx.query<ExchangeRow>(
        `SELECT * FROM card_exchange_requests
         WHERE request_id=$1 AND sender_account_id=$2 AND sender_member_identity_id=$3 FOR UPDATE`,
        [requestId, session.accountId, session.memberIdentityId]
      );
      const row = current.rows[0];
      if (!row) throw new NotFoundException("exchange request not found");
      if (row.status === "withdrawn") return { request: this.toItem(row, session), idempotent: true, auto_accepted: false };
      if (row.status !== "pending") throw new ConflictException("exchange request has already been resolved");
      const updated = await tx.query<ExchangeRow>(
        `UPDATE card_exchange_requests SET status='withdrawn',responded_at=now(),updated_at=now()
         WHERE request_id=$1 AND status='pending' RETURNING *`,
        [requestId]
      );
      return { request: this.toItem(updated.rows[0]!, session), idempotent: false, auto_accepted: false };
    });
  }

  async subscribeNotification(session: EmployeeSession, eventType: ExchangeNotificationEvent, templateId: string) {
    if (!this.database.isConfigured()) return { subscribed: true };
    await this.database.query(
      `INSERT INTO card_exchange_notification_subscriptions(account_id,event_type,template_id)
       VALUES($1,$2,$3)
       ON CONFLICT (account_id,event_type) WHERE consumed_at IS NULL
       DO UPDATE SET template_id=EXCLUDED.template_id,granted_at=now()`,
      [session.accountId, eventType, templateId]
    );
    return { subscribed: true };
  }

  async prepareNotification(requestId: string, eventType: ExchangeNotificationEvent) {
    if (!this.database.isConfigured()) return null;
    return this.database.transaction(async (tx) => {
      const target = await tx.query<{ account_id: string; openid: string | null; display_name: string }>(
        `SELECT CASE WHEN $2='request_received' THEN recipient_account_id ELSE sender_account_id END AS account_id,
           accounts.primary_wx_openid AS openid,
           CASE WHEN $2='request_received' THEN sender_card_snapshot->>'display_name' ELSE recipient_card_snapshot->>'display_name' END AS display_name
         FROM card_exchange_requests
         JOIN accounts ON accounts.id=CASE WHEN $2='request_received' THEN recipient_account_id ELSE sender_account_id END
         WHERE request_id=$1`,
        [requestId, eventType]
      );
      if (!target.rows[0]) return null;
      const inserted = await tx.query<{ id: string }>(
        `INSERT INTO card_exchange_notification_deliveries(request_id,event_type,recipient_account_id,status)
         VALUES($1,$2,$3,'pending') ON CONFLICT DO NOTHING RETURNING id`,
        [requestId, eventType, target.rows[0].account_id]
      );
      if (!inserted.rows[0]) return null;
      const subscription = await tx.query<{ id: string; template_id: string }>(
        `SELECT id,template_id FROM card_exchange_notification_subscriptions
         WHERE account_id=$1 AND event_type=$2 AND consumed_at IS NULL
         ORDER BY granted_at DESC LIMIT 1 FOR UPDATE`,
        [target.rows[0].account_id, eventType]
      );
      if (!subscription.rows[0] || !target.rows[0].openid) {
        await tx.query(
          `UPDATE card_exchange_notification_deliveries SET status='skipped',error=$2,updated_at=now() WHERE id=$1`,
          [inserted.rows[0].id, !target.rows[0].openid ? "recipient has no WeChat openid" : "no active subscription"]
        );
        return null;
      }
      await tx.query("UPDATE card_exchange_notification_subscriptions SET consumed_at=now() WHERE id=$1", [subscription.rows[0].id]);
      await tx.query("UPDATE card_exchange_notification_deliveries SET template_id=$2 WHERE id=$1", [inserted.rows[0].id, subscription.rows[0].template_id]);
      return {
        deliveryId: inserted.rows[0].id,
        openid: target.rows[0].openid,
        templateId: subscription.rows[0].template_id,
        counterpartName: target.rows[0].display_name
      };
    });
  }

  async completeNotification(deliveryId: string, error: string | null) {
    if (!this.database.isConfigured()) return;
    await this.database.query(
      `UPDATE card_exchange_notification_deliveries
       SET status=CASE WHEN $2::text IS NULL THEN 'sent' ELSE 'failed' END,
           attempts=attempts+1,error=$2,sent_at=CASE WHEN $2::text IS NULL THEN now() ELSE sent_at END,updated_at=now()
       WHERE id=$1`,
      [deliveryId, error]
    );
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
    const accepted = [...this.memory.values()].find((row) =>
      row.status === "accepted" && (
        (row.sender_card_snapshot.public_id === sender.public_id && row.recipient_card_snapshot.public_id === recipient.public_id) ||
        (row.sender_card_snapshot.public_id === recipient.public_id && row.recipient_card_snapshot.public_id === sender.public_id)
      )
    );
    if (accepted) return { request: this.toItem(accepted, session), idempotent: true, auto_accepted: false };
    const existing = [...this.memory.values()].find((row) =>
      row.sender_account_id === session.accountId && row.sender_member_identity_id === session.memberIdentityId &&
      row.recipient_card_snapshot.public_id === recipient.public_id && row.status === "pending"
    );
    if (existing) return { request: this.toItem(existing, session), idempotent: true, auto_accepted: false };
    const reverse = [...this.memory.values()].find((row) =>
      row.sender_card_snapshot.public_id === recipient.public_id && row.recipient_card_snapshot.public_id === sender.public_id && row.status === "pending"
    );
    if (reverse) {
      reverse.status = "accepted";
      reverse.recipient_read_at = new Date();
      reverse.responded_at = new Date();
      return { request: this.toItem(reverse, session), idempotent: false, auto_accepted: true };
    }
    const ignored = [...this.memory.values()].find((row) =>
      row.sender_account_id === session.accountId && row.recipient_card_snapshot.public_id === recipient.public_id &&
      row.status === "ignored" && row.responded_at && Date.now() - new Date(row.responded_at).getTime() < 7 * 86400000
    );
    if (ignored) throw new ConflictException(`exchange request cooling down until ${new Date(new Date(ignored.responded_at!).getTime() + 7 * 86400000).toISOString()}`);
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
    return { request: this.toItem(row, session), idempotent: false, auto_accepted: false };
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

type ExchangeNotificationEvent = z.infer<typeof exchangeNotificationEventSchema>;
