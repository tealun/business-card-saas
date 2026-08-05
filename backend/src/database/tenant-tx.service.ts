import { Injectable } from "@nestjs/common";
import { DatabaseService, type DatabaseTransaction } from "./database.service.js";

@Injectable()
export class TenantTx {
  constructor(private readonly database: DatabaseService) {}

  /**
   * 在一个数据库事务内设置当前租户上下文，并把带有该上下文的事务客户端交给调用方。
   *
   * 适用于受 RLS 保护的租户数据读写。`tenantId` 会写入 PostgreSQL
   * transaction-local GUC，回调结束后随 COMMIT/ROLLBACK 自动失效。
   */
  async run<T>(
    tenantId: bigint | number | string,
    callback: (tx: DatabaseTransaction) => Promise<T>
  ): Promise<T> {
    return this.database.transaction(async (tx) => {
      // RLS 策略读取这个事务级变量；第三个参数 true 表示仅在当前事务内生效，
      // 避免连接池复用时把上一个请求的租户上下文泄漏给下一个请求。
      await tx.query("SELECT set_config('app.tenant_id', $1, true)", [String(tenantId)]);
      return callback(tx);
    });
  }

  /**
   * 在一个数据库事务内设置当前账号上下文，并执行账号级身份相关读写。
   *
   * 适用于首次企业认领、登录归并等尚未确定租户行的流程；这些流程需要以账号
   * 而不是租户作为 RLS/策略判断入口。
   */
  async runForAccount<T>(
    accountId: bigint | number | string,
    callback: (tx: DatabaseTransaction) => Promise<T>
  ): Promise<T> {
    return this.database.transaction(async (tx) => {
      // 首次认领/登录阶段还没有明确租户，部分身份表必须先按账号维度授权。
      await tx.query("SELECT set_config('app.account_id', $1, true)", [String(accountId)]);
      return callback(tx);
    });
  }
}

export type TenantTransactionClient = DatabaseTransaction;
