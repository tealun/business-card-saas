import { Injectable, Optional } from "@nestjs/common";
import type { QueryResultRow } from "pg";
import type { AdminSession } from "../admin-auth/admin-session.js";
import { TenantTx } from "../database/tenant-tx.service.js";
import type { AdminAnalyticsQuery, AdminAnalyticsResponse } from "../contracts/admin-analytics.js";

interface OverviewRow extends QueryResultRow {
  visit_count: string | number | bigint;
  visitor_count: string | number | bigint;
  action_count: string | number | bigint;
  share_count: string | number | bigint;
  active_card_count: string | number | bigint;
}

interface TrendRow extends QueryResultRow {
  day: Date | string;
  visit_count: string | number | bigint;
  action_count: string | number | bigint;
}

interface MemberRankRow extends QueryResultRow {
  member_identity_id: string | number | bigint;
  display_name: string;
  public_id: string | null;
  visit_count: string | number | bigint;
  visitor_count: string | number | bigint;
  action_count: string | number | bigint;
}

interface ActionTypeRow extends QueryResultRow {
  action_type: string;
  action_count: string | number | bigint;
}

@Injectable()
export class AdminAnalyticsRepository {
  constructor(@Optional() private readonly tenantTx?: TenantTx) {}

  async getTenantAnalytics(session: AdminSession, query: AdminAnalyticsQuery): Promise<AdminAnalyticsResponse> {
    if (!this.hasDatabase()) {
      return emptyAnalytics();
    }

    return this.tenantTx!.run(session.tenantId, async (tx) => {
      const [overview, trend, memberRank, actionTypes] = await Promise.all([
        tx.query<OverviewRow>(
          `
            SELECT
              (SELECT count(*) FROM card_visits WHERE tenant_id = $1) AS visit_count,
              (SELECT count(DISTINCT COALESCE(visitor_account_id::text, anon_id, id::text)) FROM card_visits WHERE tenant_id = $1) AS visitor_count,
              (SELECT count(*) FROM card_actions WHERE tenant_id = $1) AS action_count,
              (SELECT count(*) FROM card_shares WHERE tenant_id = $1) AS share_count,
              (SELECT count(*) FROM cards WHERE tenant_id = $1 AND status = 'active' AND deleted_at IS NULL) AS active_card_count
          `,
          [session.tenantId]
        ),
        tx.query<TrendRow>(
          `
            WITH days AS (
              SELECT generate_series(current_date - ($2::int - 1), current_date, interval '1 day')::date AS day
            ),
            visits AS (
              SELECT created_at::date AS day, count(*) AS visit_count
              FROM card_visits
              WHERE tenant_id = $1 AND created_at >= current_date - ($2::int - 1)
              GROUP BY created_at::date
            ),
            actions AS (
              SELECT created_at::date AS day, count(*) AS action_count
              FROM card_actions
              WHERE tenant_id = $1 AND created_at >= current_date - ($2::int - 1)
              GROUP BY created_at::date
            )
            SELECT
              days.day,
              COALESCE(visits.visit_count, 0) AS visit_count,
              COALESCE(actions.action_count, 0) AS action_count
            FROM days
            LEFT JOIN visits ON visits.day = days.day
            LEFT JOIN actions ON actions.day = days.day
            ORDER BY days.day ASC
          `,
          [session.tenantId, query.days]
        ),
        tx.query<MemberRankRow>(
          `
            SELECT
              m.id AS member_identity_id,
              m.name AS display_name,
              c.public_id,
              count(DISTINCT v.id) AS visit_count,
              count(DISTINCT COALESCE(v.visitor_account_id::text, v.anon_id, v.id::text)) AS visitor_count,
              count(DISTINCT a.id) AS action_count
            FROM member_identities m
            LEFT JOIN cards c
              ON c.tenant_id = m.tenant_id
              AND c.member_identity_id = m.id
              AND c.card_type = 'primary'
              AND c.deleted_at IS NULL
            LEFT JOIN card_visits v
              ON v.tenant_id = m.tenant_id
              AND v.member_identity_id = m.id
            LEFT JOIN card_actions a
              ON a.tenant_id = m.tenant_id
              AND a.member_identity_id = m.id
            WHERE m.tenant_id = $1
            GROUP BY m.id, m.name, c.public_id
            ORDER BY count(DISTINCT v.id) DESC, count(DISTINCT a.id) DESC, m.id ASC
            LIMIT 20
          `,
          [session.tenantId]
        ),
        tx.query<ActionTypeRow>(
          `
            SELECT action_type, count(*) AS action_count
            FROM card_actions
            WHERE tenant_id = $1
            GROUP BY action_type
            ORDER BY count(*) DESC, action_type ASC
            LIMIT 20
          `,
          [session.tenantId]
        )
      ]);

      const overviewRow = overview.rows[0];
      return {
        overview: {
          visit_count: numberValue(overviewRow?.visit_count),
          visitor_count: numberValue(overviewRow?.visitor_count),
          action_count: numberValue(overviewRow?.action_count),
          share_count: numberValue(overviewRow?.share_count),
          active_card_count: numberValue(overviewRow?.active_card_count)
        },
        trend: trend.rows.map((row) => ({
          date: dateOnly(row.day),
          visit_count: numberValue(row.visit_count),
          action_count: numberValue(row.action_count)
        })),
        member_rank: memberRank.rows.map((row) => ({
          member_identity_id: String(row.member_identity_id),
          display_name: row.display_name,
          public_id: row.public_id,
          visit_count: numberValue(row.visit_count),
          visitor_count: numberValue(row.visitor_count),
          action_count: numberValue(row.action_count)
        })),
        action_types: actionTypes.rows.map((row) => ({
          action_type: row.action_type,
          action_count: numberValue(row.action_count)
        }))
      };
    });
  }

  private hasDatabase(): boolean {
    return Boolean(this.tenantTx && process.env.DATABASE_URL?.trim());
  }
}

function emptyAnalytics(): AdminAnalyticsResponse {
  return {
    overview: {
      visit_count: 0,
      visitor_count: 0,
      action_count: 0,
      share_count: 0,
      active_card_count: 0
    },
    trend: [],
    member_rank: [],
    action_types: []
  };
}

function numberValue(value: string | number | bigint | undefined): number {
  return Number(value ?? 0);
}

function dateOnly(value: Date | string): string {
  return new Date(value).toISOString().slice(0, 10);
}
