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
      await tx.query("SELECT set_config('app.tenant_id', $1, true)", [String(tenantId)]);
      return callback(tx);
    });
  }

  async runForAccount<T>(
    accountId: bigint | number | string,
    callback: (tx: DatabaseTransaction) => Promise<T>
  ): Promise<T> {
    return this.database.transaction(async (tx) => {
      await tx.query("SELECT set_config('app.account_id', $1, true)", [String(accountId)]);
      return callback(tx);
    });
  }
}

export type TenantTransactionClient = DatabaseTransaction;
