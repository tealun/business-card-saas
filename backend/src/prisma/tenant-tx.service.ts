import { Injectable } from "@nestjs/common";
import { Prisma, PrismaClient } from "@prisma/client";
import { PrismaService } from "./prisma.service.js";

type TxClient = Prisma.TransactionClient;

@Injectable()
export class TenantTx {
  constructor(private readonly prisma: PrismaService) {}

  async run<T>(tenantId: bigint | number | string, callback: (tx: TxClient) => Promise<T>): Promise<T> {
    return this.prisma.$transaction(async (tx: TxClient) => {
      await tx.$executeRaw`SELECT set_config('app.tenant_id', ${String(tenantId)}, true)`;
      return callback(tx);
    });
  }

  async runForAccount<T>(
    accountId: bigint | number | string,
    callback: (tx: TxClient) => Promise<T>
  ): Promise<T> {
    return this.prisma.$transaction(async (tx: TxClient) => {
      await tx.$executeRaw`SELECT set_config('app.account_id', ${String(accountId)}, true)`;
      return callback(tx);
    });
  }
}

export type TenantTransactionClient = TxClient;
export type BusinessPrismaClient = PrismaClient;
