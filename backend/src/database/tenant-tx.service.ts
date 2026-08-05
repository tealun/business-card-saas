import { Injectable } from "@nestjs/common";
import { DatabaseService, type DatabaseTransaction } from "./database.service.js";

@Injectable()
export class TenantTx {
  constructor(private readonly database: DatabaseService) {}

  async run<T>(
    tenantId: bigint | number | string,
    callback: (tx: DatabaseTransaction) => Promise<T>
  ): Promise<T> {
    return this.database.transaction(async (tx) => {
      // RLS policies read this transaction-local setting. Keep it scoped with
      // `is_local=true` so pooled connections cannot leak a tenant into the next
      // request after COMMIT/ROLLBACK.
      await tx.query("SELECT set_config('app.tenant_id', $1, true)", [String(tenantId)]);
      return callback(tx);
    });
  }

  async runForAccount<T>(
    accountId: bigint | number | string,
    callback: (tx: DatabaseTransaction) => Promise<T>
  ): Promise<T> {
    return this.database.transaction(async (tx) => {
      // Some identity tables are account-scoped rather than tenant-scoped during
      // first-time enterprise claim/login flows, before a tenant row is selected.
      await tx.query("SELECT set_config('app.account_id', $1, true)", [String(accountId)]);
      return callback(tx);
    });
  }
}

export type TenantTransactionClient = DatabaseTransaction;
