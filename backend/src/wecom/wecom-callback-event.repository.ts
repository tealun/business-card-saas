import { Injectable, Optional } from "@nestjs/common";
import type { QueryResultRow } from "pg";
import { DatabaseService } from "../database/database.service.js";

export type WecomCallbackEventSource = "command" | "data" | "sync";
export type WecomCallbackEventStatus = "received" | "processing" | "done" | "failed" | "dead";

const PROCESSING_STALE_MS = 5 * 60 * 1000;

export interface BeginWecomCallbackEventInput {
  source: WecomCallbackEventSource;
  eventKey: string;
  tenantId: string | null;
  eventType: string;
  changeType: string | null;
  payloadEncrypted: string | null;
}

export interface BeginWecomCallbackEventResult {
  shouldProcess: boolean;
  status: WecomCallbackEventStatus;
  retryCount: number;
}

export interface RetryableWecomCallbackEvent {
  eventKey: string;
  tenantId: string | null;
  eventType: string;
  changeType: string | null;
  payloadEncrypted: string;
  retryCount: number;
}

interface StoredCallbackEvent {
  source: WecomCallbackEventSource;
  tenantId: string | null;
  eventType: string;
  changeType: string | null;
  payloadEncrypted: string | null;
  status: WecomCallbackEventStatus;
  retryCount: number;
  lastError: string | null;
  receivedAt: Date;
  updatedAt: Date;
  processedAt: Date | null;
}

interface CallbackEventRow extends QueryResultRow {
  status: WecomCallbackEventStatus;
  retry_count: number;
  updated_at: Date | string;
}

interface RetryableCallbackEventRow extends QueryResultRow {
  event_key: string;
  tenant_id: string | number | bigint | null;
  event_type: string;
  change_type: string | null;
  payload_encrypted: string;
  retry_count: number;
}

@Injectable()
export class WecomCallbackEventRepository {
  private readonly memory = new Map<string, StoredCallbackEvent>();

  constructor(@Optional() private readonly database?: DatabaseService) {}

  async beginProcessing(input: BeginWecomCallbackEventInput): Promise<BeginWecomCallbackEventResult> {
    if (!this.hasDatabase()) {
      return this.beginProcessingInMemory(input);
    }

    return this.database!.transaction(async (tx) => {
      const existing = await tx.query<CallbackEventRow>(
        `
          SELECT status, retry_count, updated_at
          FROM callback_events
          WHERE event_key = $1
          FOR UPDATE
        `,
        [input.eventKey]
      );
      const current = existing.rows[0];
      if (!current) {
        const inserted = await tx.query<CallbackEventRow>(
          `
            INSERT INTO callback_events (
              source,
              event_key,
              tenant_id,
              event_type,
              change_type,
              payload_encrypted,
              status,
              retry_count,
              received_at,
              created_at,
              updated_at
            )
            VALUES ($1, $2, $3, $4, $5, $6, 'processing', 0, now(), now(), now())
            RETURNING status, retry_count
          `,
          [
            input.source,
            input.eventKey,
            input.tenantId,
            input.eventType,
            input.changeType,
            input.payloadEncrypted
          ]
        );
        return toBeginResult(inserted.rows[0], true);
      }

      if (current.status === "failed" || current.status === "received" || isStaleProcessing(current)) {
        const retryIncrement = current.status === "received" ? 0 : 1;
        const retry = await tx.query<CallbackEventRow>(
          `
            UPDATE callback_events
            SET tenant_id = COALESCE($2, tenant_id),
                event_type = $3,
                change_type = $4,
                payload_encrypted = COALESCE($5, payload_encrypted),
                status = 'processing',
                retry_count = retry_count + $6::int,
                last_error = NULL,
                updated_at = now()
            WHERE event_key = $1
            RETURNING status, retry_count, updated_at
          `,
          [
            input.eventKey,
            input.tenantId,
            input.eventType,
            input.changeType,
            input.payloadEncrypted,
            retryIncrement
          ]
        );
        return toBeginResult(retry.rows[0], true);
      }

      return {
        shouldProcess: false,
        status: current.status,
        retryCount: current.retry_count
      };
    });
  }

  async markDone(eventKey: string, tenantId: string | null): Promise<void> {
    if (!this.hasDatabase()) {
      const current = this.memory.get(eventKey);
      if (current) {
        const now = new Date();
        this.memory.set(eventKey, {
          ...current,
          tenantId: tenantId ?? current.tenantId,
          status: "done",
          processedAt: now,
          updatedAt: now,
          lastError: null
        });
      }
      return;
    }

    await this.database!.query(
      `
        UPDATE callback_events
        SET tenant_id = COALESCE($2, tenant_id),
            status = 'done',
            processed_at = now(),
            last_error = NULL,
            updated_at = now()
        WHERE event_key = $1
      `,
      [eventKey, tenantId]
    );
  }

  async markFailed(
    eventKey: string,
    error: unknown,
    tenantId: string | null,
    options: { deadLetter?: boolean } = {}
  ): Promise<void> {
    const message = errorMessage(error);
    const status: WecomCallbackEventStatus = options.deadLetter ? "dead" : "failed";
    if (!this.hasDatabase()) {
      const current = this.memory.get(eventKey);
      if (current) {
        const now = new Date();
        this.memory.set(eventKey, {
          ...current,
          tenantId: tenantId ?? current.tenantId,
          status,
          lastError: message,
          updatedAt: now
        });
      }
      return;
    }

    await this.database!.query(
      `
        UPDATE callback_events
        SET tenant_id = COALESCE($2, tenant_id),
            status = $4,
            last_error = $3,
            updated_at = now()
        WHERE event_key = $1
      `,
      [eventKey, tenantId, message, status]
    );
  }

  async listRetryableDataEvents(
    maxRetryCount: number,
    limit = 20,
    tenantId: string | null = null
  ): Promise<RetryableWecomCallbackEvent[]> {
    if (!this.hasDatabase()) {
      return [...this.memory.entries()]
        .filter(([, event]) => event.source === "data")
        .filter(([, event]) => !tenantId || event.tenantId === tenantId)
        .filter(([, event]) => event.status === "failed")
        .filter(([, event]) => Boolean(event.payloadEncrypted))
        .filter(([, event]) => event.retryCount < maxRetryCount)
        .sort((left, right) => left[1].updatedAt.getTime() - right[1].updatedAt.getTime())
        .slice(0, limit)
        .map(([eventKey, event]) => ({
          eventKey,
          tenantId: event.tenantId,
          eventType: event.eventType,
          changeType: event.changeType,
          payloadEncrypted: event.payloadEncrypted!,
          retryCount: event.retryCount
        }));
    }

    const result = await this.database!.query<RetryableCallbackEventRow>(
      `
        SELECT
          event_key,
          tenant_id,
          event_type,
          change_type,
          payload_encrypted,
          retry_count
        FROM callback_events
        WHERE source = 'data'
          AND status = 'failed'
          AND payload_encrypted IS NOT NULL
          AND retry_count < $1
          AND ($3::bigint IS NULL OR tenant_id = $3)
        ORDER BY updated_at ASC, id ASC
        LIMIT $2
      `,
      [maxRetryCount, limit, tenantId]
    );
    return result.rows.map((row) => ({
      eventKey: row.event_key,
      tenantId: row.tenant_id === null ? null : String(row.tenant_id),
      eventType: row.event_type,
      changeType: row.change_type,
      payloadEncrypted: row.payload_encrypted,
      retryCount: row.retry_count
    }));
  }

  async recordTenantSyncFailure(input: {
    eventKey: string;
    tenantId: string;
    eventType: string;
    changeType: string | null;
    error: unknown;
  }): Promise<void> {
    const message = errorMessage(input.error);
    if (!this.hasDatabase()) {
      const now = new Date();
      const current = this.memory.get(input.eventKey);
      this.memory.set(input.eventKey, {
        source: "sync",
        tenantId: input.tenantId,
        eventType: input.eventType,
        changeType: input.changeType,
        payloadEncrypted: null,
        status: "failed",
        retryCount: current?.retryCount ?? 0,
        lastError: message,
        receivedAt: current?.receivedAt ?? now,
        updatedAt: now,
        processedAt: null
      });
      return;
    }

    await this.database!.query(
      `
        INSERT INTO callback_events (
          source,
          event_key,
          tenant_id,
          event_type,
          change_type,
          payload_encrypted,
          status,
          retry_count,
          last_error,
          received_at,
          created_at,
          updated_at
        )
        VALUES ('sync', $1, $2, $3, $4, NULL, 'failed', 0, $5, now(), now(), now())
        ON CONFLICT (event_key) DO UPDATE SET
          tenant_id = EXCLUDED.tenant_id,
          event_type = EXCLUDED.event_type,
          change_type = EXCLUDED.change_type,
          status = 'failed',
          last_error = EXCLUDED.last_error,
          updated_at = now()
      `,
      [input.eventKey, input.tenantId, input.eventType, input.changeType, message]
    );
  }

  async listRetryableSyncEvents(
    maxRetryCount: number,
    limit = 20,
    tenantId: string | null = null
  ): Promise<RetryableWecomCallbackEvent[]> {
    if (!this.hasDatabase()) {
      return [...this.memory.entries()]
        .filter(([, event]) => event.source === "sync")
        .filter(([, event]) => !tenantId || event.tenantId === tenantId)
        .filter(([, event]) => event.status === "failed")
        .filter(([, event]) => event.retryCount < maxRetryCount)
        .sort((left, right) => left[1].updatedAt.getTime() - right[1].updatedAt.getTime())
        .slice(0, limit)
        .map(([eventKey, event]) => ({
          eventKey,
          tenantId: event.tenantId,
          eventType: event.eventType,
          changeType: event.changeType,
          payloadEncrypted: "",
          retryCount: event.retryCount
        }));
    }

    const result = await this.database!.query<RetryableCallbackEventRow>(
      `
        SELECT
          event_key,
          tenant_id,
          event_type,
          change_type,
          '' AS payload_encrypted,
          retry_count
        FROM callback_events
        WHERE source = 'sync'
          AND status = 'failed'
          AND retry_count < $1
          AND ($3::bigint IS NULL OR tenant_id = $3)
        ORDER BY updated_at ASC, id ASC
        LIMIT $2
      `,
      [maxRetryCount, limit, tenantId]
    );
    return result.rows.map((row) => ({
      eventKey: row.event_key,
      tenantId: row.tenant_id === null ? null : String(row.tenant_id),
      eventType: row.event_type,
      changeType: row.change_type,
      payloadEncrypted: "",
      retryCount: row.retry_count
    }));
  }

  private beginProcessingInMemory(input: BeginWecomCallbackEventInput): BeginWecomCallbackEventResult {
    const current = this.memory.get(input.eventKey);
    if (!current) {
      const now = new Date();
      this.memory.set(input.eventKey, {
        source: input.source,
        tenantId: input.tenantId,
        eventType: input.eventType,
        changeType: input.changeType,
        payloadEncrypted: input.payloadEncrypted,
        status: "processing",
        retryCount: 0,
        lastError: null,
        receivedAt: now,
        updatedAt: now,
        processedAt: null
      });
      return { shouldProcess: true, status: "processing", retryCount: 0 };
    }

    if (current.status === "failed" || current.status === "received" || isStaleMemoryProcessing(current)) {
      const retryCount = current.status === "received" ? current.retryCount : current.retryCount + 1;
      this.memory.set(input.eventKey, {
        ...current,
        tenantId: input.tenantId ?? current.tenantId,
        eventType: input.eventType,
        changeType: input.changeType,
        payloadEncrypted: input.payloadEncrypted ?? current.payloadEncrypted,
        status: "processing",
        retryCount,
        lastError: null,
        updatedAt: new Date()
      });
      return { shouldProcess: true, status: "processing", retryCount };
    }

    return {
      shouldProcess: false,
      status: current.status,
      retryCount: current.retryCount
    };
  }

  private hasDatabase(): boolean {
    return Boolean(this.database && process.env.DATABASE_URL?.trim());
  }
}

function toBeginResult(row: CallbackEventRow | undefined, shouldProcess: boolean): BeginWecomCallbackEventResult {
  if (!row) {
    throw new Error("failed to record WeCom callback event");
  }
  return {
    shouldProcess,
    status: row.status,
    retryCount: row.retry_count
  };
}

function isStaleProcessing(row: CallbackEventRow): boolean {
  return row.status === "processing" && Date.now() - new Date(row.updated_at).getTime() >= PROCESSING_STALE_MS;
}

function isStaleMemoryProcessing(event: StoredCallbackEvent): boolean {
  return event.status === "processing" && Date.now() - event.updatedAt.getTime() >= PROCESSING_STALE_MS;
}

function errorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.slice(0, 1000);
}
