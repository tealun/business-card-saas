import { Injectable, Optional } from "@nestjs/common";
import type { QueryResultRow } from "pg";
import type { AdminSession } from "../admin-auth/admin-session.js";
import { DatabaseService } from "../database/database.service.js";
import { TenantTx } from "../database/tenant-tx.service.js";
import type {
  PlatformCommercialResponse,
  QuotaAdjustmentRequest,
  TenantCommercialResponse
} from "../contracts/admin-commercial.js";

interface PlanRow extends QueryResultRow {
  plan_key: string;
  name: string;
  status: string;
  billing_period: string;
  price_cents: number;
  currency: string;
  member_limit: number;
  card_limit: number;
  video_limit_bytes: string | number | bigint;
}

interface SubscriptionRow extends QueryResultRow {
  subscription_id: string | number | bigint | null;
  tenant_id?: string | number | bigint;
  tenant_name?: string;
  status: string | null;
  started_at: Date | string | null;
  expires_at: Date | string | null;
  member_count: string | number | bigint;
  active_card_count: string | number | bigint;
  video_count: string | number | bigint;
  member_adjustment: string | number | bigint;
  card_adjustment: string | number | bigint;
  video_mb_adjustment: string | number | bigint;
  plan_key: string | null;
  name: string | null;
  plan_status: string | null;
  billing_period: string | null;
  price_cents: number | null;
  currency: string | null;
  member_limit: number | null;
  card_limit: number | null;
  video_limit_bytes: string | number | bigint | null;
}

interface OrderRow extends QueryResultRow {
  order_id: string | number | bigint;
  tenant_id: string | number | bigint;
  tenant_name: string | null;
  order_no: string;
  plan_key: string;
  amount_cents: number;
  currency: string;
  status: string;
  paid_at: Date | string | null;
  created_at: Date | string;
}

interface LedgerRow extends QueryResultRow {
  ledger_id: string | number | bigint;
  tenant_id: string | number | bigint;
  quota_type: "member" | "card" | "video_mb";
  delta: number;
  reason: string;
  idempotency_key: string;
  created_by: string;
  created_at: Date | string;
}

@Injectable()
export class AdminCommercialRepository {
  constructor(
    @Optional() private readonly tenantTx?: TenantTx,
    @Optional() private readonly database?: DatabaseService
  ) {}

  async tenantCommercial(session: AdminSession): Promise<TenantCommercialResponse> {
    if (!this.hasTenantDatabase()) return emptyTenantCommercial();
    return this.tenantTx!.run(session.tenantId, async (tx) => {
      const [plans, subscriptionRows, orders, ledger] = await Promise.all([
        tx.query<PlanRow>(planSql()),
        tx.query<SubscriptionRow>(subscriptionSql("WHERE t.id = $1"), [session.tenantId]),
        tx.query<OrderRow>(orderSql("WHERE o.tenant_id = $1"), [session.tenantId]),
        tx.query<LedgerRow>(ledgerSql("WHERE tenant_id = $1"), [session.tenantId])
      ]);
      return {
        subscription: subscriptionFrom(subscriptionRows.rows[0], plans.rows[0]),
        orders: orders.rows.map(orderFrom),
        quota_ledger: ledger.rows.map(ledgerFrom)
      };
    });
  }

  async platformCommercial(): Promise<PlatformCommercialResponse> {
    if (!this.hasPlatformDatabase()) return { plans: [], subscriptions: [], orders: [] };
    const [plans, subscriptions, orders] = await Promise.all([
      this.database!.query<PlanRow>(planSql()),
      this.database!.query<SubscriptionRow>(subscriptionSql("WHERE t.tenant_type = 'enterprise'")),
      this.database!.query<OrderRow>(orderSql(""))
    ]);
    const fallback = plans.rows[0];
    return {
      plans: plans.rows.map(planFrom),
      subscriptions: subscriptions.rows.map((row) => ({
        tenant_id: String(row.tenant_id),
        tenant_name: row.tenant_name ?? "",
        ...subscriptionFrom(row, fallback)
      })),
      orders: orders.rows.map(orderFrom)
    };
  }

  async createQuotaAdjustment(session: AdminSession, request: QuotaAdjustmentRequest): Promise<LedgerRow> {
    if (!this.hasPlatformDatabase()) {
      throw new Error("database is required for quota adjustments");
    }
    const result = await this.database!.query<LedgerRow>(
      `
        INSERT INTO tenant_quota_ledger (tenant_id, quota_type, delta, reason, idempotency_key, created_by, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, now())
        ON CONFLICT (tenant_id, idempotency_key) DO UPDATE SET reason = tenant_quota_ledger.reason
        RETURNING id AS ledger_id, tenant_id, quota_type, delta, reason, idempotency_key, created_by, created_at
      `,
      [request.tenant_id, request.quota_type, request.delta, request.reason, request.idempotency_key, session.openUserid]
    );
    return result.rows[0]!;
  }

  private hasTenantDatabase(): boolean {
    return Boolean(this.tenantTx && process.env.DATABASE_URL?.trim());
  }

  private hasPlatformDatabase(): boolean {
    return Boolean(this.database && process.env.DATABASE_URL?.trim());
  }
}

function planSql(): string {
  return `
    SELECT plan_key, name, status, billing_period, price_cents, currency, member_limit, card_limit, video_limit_bytes
    FROM commercial_plans
    WHERE status = 'active'
    ORDER BY price_cents ASC, plan_key ASC
  `;
}

function subscriptionSql(whereSql: string): string {
  return `
    SELECT
      s.id AS subscription_id,
      t.id AS tenant_id,
      t.name AS tenant_name,
      COALESCE(s.status, 'inactive') AS status,
      s.started_at,
      s.expires_at,
      (SELECT count(*) FROM member_identities m WHERE m.tenant_id = t.id) AS member_count,
      (SELECT count(*) FROM cards c WHERE c.tenant_id = t.id AND c.status = 'active' AND c.deleted_at IS NULL) AS active_card_count,
      (SELECT count(*) FROM company_videos v WHERE v.tenant_id = t.id AND v.deleted_at IS NULL) AS video_count,
      COALESCE((SELECT sum(delta) FROM tenant_quota_ledger q WHERE q.tenant_id = t.id AND q.quota_type = 'member'), 0) AS member_adjustment,
      COALESCE((SELECT sum(delta) FROM tenant_quota_ledger q WHERE q.tenant_id = t.id AND q.quota_type = 'card'), 0) AS card_adjustment,
      COALESCE((SELECT sum(delta) FROM tenant_quota_ledger q WHERE q.tenant_id = t.id AND q.quota_type = 'video_mb'), 0) AS video_mb_adjustment,
      p.plan_key, p.name, p.status AS plan_status, p.billing_period, p.price_cents, p.currency, p.member_limit, p.card_limit, p.video_limit_bytes
    FROM tenants t
    LEFT JOIN tenant_subscriptions s ON s.tenant_id = t.id AND s.status = 'active'
    LEFT JOIN commercial_plans p ON p.plan_key = COALESCE(s.plan_key, 'free')
    ${whereSql}
    ORDER BY t.id ASC
    LIMIT 100
  `;
}

function orderSql(whereSql: string): string {
  return `
    SELECT o.id AS order_id, o.tenant_id, t.name AS tenant_name, o.order_no, o.plan_key, o.amount_cents, o.currency, o.status, o.paid_at, o.created_at
    FROM commercial_orders o
    LEFT JOIN tenants t ON t.id = o.tenant_id
    ${whereSql}
    ORDER BY o.created_at DESC, o.id DESC
    LIMIT 100
  `;
}

function ledgerSql(whereSql: string): string {
  return `
    SELECT id AS ledger_id, tenant_id, quota_type, delta, reason, idempotency_key, created_by, created_at
    FROM tenant_quota_ledger
    ${whereSql}
    ORDER BY created_at DESC, id DESC
    LIMIT 100
  `;
}

function subscriptionFrom(row: SubscriptionRow | undefined, fallback: PlanRow | undefined) {
  const plan = planFrom({
    plan_key: row?.plan_key ?? fallback?.plan_key ?? "free",
    name: row?.name ?? fallback?.name ?? "Free",
    status: row?.plan_status ?? fallback?.status ?? "active",
    billing_period: row?.billing_period ?? fallback?.billing_period ?? "monthly",
    price_cents: Number(row?.price_cents ?? fallback?.price_cents ?? 0),
    currency: row?.currency ?? fallback?.currency ?? "CNY",
    member_limit: Number(row?.member_limit ?? fallback?.member_limit ?? 50),
    card_limit: Number(row?.card_limit ?? fallback?.card_limit ?? 50),
    video_limit_bytes: row?.video_limit_bytes ?? fallback?.video_limit_bytes ?? 0
  });
  return {
    subscription_id: row?.subscription_id ? String(row.subscription_id) : null,
    plan,
    status: row?.status ?? "inactive",
    started_at: row?.started_at ? iso(row.started_at) : null,
    expires_at: row?.expires_at ? iso(row.expires_at) : null,
    usage: {
      member_count: Number(row?.member_count ?? 0),
      active_card_count: Number(row?.active_card_count ?? 0),
      video_count: Number(row?.video_count ?? 0)
    },
    quota_adjustments: {
      member: Number(row?.member_adjustment ?? 0),
      card: Number(row?.card_adjustment ?? 0),
      video_mb: Number(row?.video_mb_adjustment ?? 0)
    }
  };
}

function planFrom(row: PlanRow) {
  return {
    plan_key: row.plan_key,
    name: row.name,
    status: row.status,
    billing_period: row.billing_period,
    price_cents: Number(row.price_cents),
    currency: row.currency,
    member_limit: Number(row.member_limit),
    card_limit: Number(row.card_limit),
    video_limit_bytes: Number(row.video_limit_bytes)
  };
}

function orderFrom(row: OrderRow) {
  return {
    order_id: String(row.order_id),
    tenant_id: String(row.tenant_id),
    tenant_name: row.tenant_name,
    order_no: row.order_no,
    plan_key: row.plan_key,
    amount_cents: Number(row.amount_cents),
    currency: row.currency,
    status: row.status,
    paid_at: row.paid_at ? iso(row.paid_at) : null,
    created_at: iso(row.created_at)
  };
}

function ledgerFrom(row: LedgerRow) {
  return {
    ledger_id: String(row.ledger_id),
    tenant_id: String(row.tenant_id),
    quota_type: row.quota_type,
    delta: Number(row.delta),
    reason: row.reason,
    idempotency_key: row.idempotency_key,
    created_by: row.created_by,
    created_at: iso(row.created_at)
  };
}

function emptyTenantCommercial(): TenantCommercialResponse {
  return {
    subscription: subscriptionFrom(undefined, undefined),
    orders: [],
    quota_ledger: []
  };
}

function iso(value: Date | string): string {
  return new Date(value).toISOString();
}
