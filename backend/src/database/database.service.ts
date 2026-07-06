import { Injectable, OnModuleDestroy } from "@nestjs/common";
import { Pool, type PoolClient, type QueryResult, type QueryResultRow } from "pg";

export interface DatabaseTransaction {
  query<T extends QueryResultRow = QueryResultRow>(text: string, values?: unknown[]): Promise<QueryResult<T>>;
}

@Injectable()
export class DatabaseService implements OnModuleDestroy {
  private readonly pool: Pool | null;

  constructor() {
    if (process.env.NODE_ENV === "production" && !process.env.DATABASE_URL) {
      throw new Error("DATABASE_URL must be set in production");
    }
    this.pool = process.env.DATABASE_URL ? new Pool({ connectionString: process.env.DATABASE_URL }) : null;
  }

  async query<T extends QueryResultRow = QueryResultRow>(
    text: string,
    values?: unknown[]
  ): Promise<QueryResult<T>> {
    return this.getPool().query<T>(text, values);
  }

  async transaction<T>(callback: (tx: DatabaseTransaction) => Promise<T>): Promise<T> {
    const client = await this.getPool().connect();
    try {
      await client.query("BEGIN");
      const result = await callback(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await rollback(client);
      throw error;
    } finally {
      client.release();
    }
  }

  // A12-P2-3: readiness probe. Distinguishes "no pool configured" from "pool configured but unreachable".
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

async function rollback(client: PoolClient): Promise<void> {
  try {
    await client.query("ROLLBACK");
  } catch {
    // Preserve the original transaction error.
  }
}
