import { Injectable, OnModuleDestroy, Optional } from "@nestjs/common";
import { Pool, type PoolClient, type QueryResult, type QueryResultRow } from "pg";
import { AppConfig } from "../config/app-config.js";

export interface DatabaseTransaction {
  query<T extends QueryResultRow = QueryResultRow>(text: string, values?: unknown[]): Promise<QueryResult<T>>;
}

@Injectable()
export class DatabaseService implements OnModuleDestroy {
  private readonly pool: Pool | null;

  constructor(@Optional() private readonly config?: AppConfig) {
    const databaseUrl = this.config?.databaseUrl ?? process.env.DATABASE_URL;
    if ((this.config?.isProduction ?? process.env.NODE_ENV === "production") && !databaseUrl) {
      throw new Error("DATABASE_URL must be set in production");
    }
    this.pool = databaseUrl
      ? new Pool({
          connectionString: databaseUrl,
          max: this.config?.databasePoolMax ?? parsePositiveInt(process.env.DATABASE_POOL_MAX, 10),
          connectionTimeoutMillis:
            this.config?.databaseConnectTimeoutMs ?? parsePositiveInt(process.env.DATABASE_CONNECT_TIMEOUT_MS, 5_000),
          idleTimeoutMillis:
            this.config?.databaseIdleTimeoutMs ?? parsePositiveInt(process.env.DATABASE_IDLE_TIMEOUT_MS, 30_000),
          statement_timeout:
            this.config?.databaseStatementTimeoutMs ?? parsePositiveInt(process.env.DATABASE_STATEMENT_TIMEOUT_MS, 15_000),
          application_name:
            this.config?.databaseApplicationName ?? process.env.DATABASE_APPLICATION_NAME ?? "business-card-backend",
          ssl: (this.config?.databaseSsl ?? process.env.DATABASE_SSL) === "require" ? { rejectUnauthorized: true } : undefined
        })
      : null;
    this.pool?.on("error", (error) => {
      console.error("PostgreSQL pool error", { message: error.message });
    });
  }

  async query<T extends QueryResultRow = QueryResultRow>(
    text: string,
    values?: unknown[]
  ): Promise<QueryResult<T>> {
    return this.getPool().query<T>(text, values);
  }

  /**
   * 使用同一个 PostgreSQL 连接执行事务回调。
   *
   * 调用方可以在回调中设置事务级上下文（例如租户 RLS GUC），这里负责 BEGIN、
   * COMMIT、ROLLBACK 和连接释放；回调抛出的原始错误会保留给上层处理。
   */
  async transaction<T>(callback: (tx: DatabaseTransaction) => Promise<T>): Promise<T> {
    const client = await this.getPool().connect();
    try {
      await client.query("BEGIN");
      const result = await callback(client);
      // TenantTx 等调用方会设置事务级 RLS 上下文；COMMIT 同时结束事务并释放这些变量。
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await rollback(client);
      throw error;
    } finally {
      client.release();
    }
  }

  // A12-P2-3：readiness 探针，区分“未配置连接池”和“已配置但不可达”。
  async ping(): Promise<{ configured: boolean; ok: boolean }> {
    if (!this.pool) {
      return { configured: false, ok: false };
    }
    try {
      await this.pool.query("SELECT 1");
      return { configured: true, ok: true };
    } catch {
      return { configured: true, ok: false };
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
    }
  }

  private getPool(): Pool {
    if (!this.pool) {
      throw new Error("DATABASE_URL is required before using the database");
    }
    return this.pool;
  }
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  // 运维调参写错时回落到默认值，避免本地/测试启动被非关键参数阻断；
  // 生产必填项仍由 AppConfig 在使用前统一校验。
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

async function rollback(client: PoolClient): Promise<void> {
  try {
    await client.query("ROLLBACK");
  } catch {
    // 保留原始事务错误，回滚失败不覆盖上层真正需要处理的异常。
  }
}
