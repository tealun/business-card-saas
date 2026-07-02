import { Global, Module } from "@nestjs/common";
import { PrismaService } from "./prisma.service.js";
import { TenantTx } from "./tenant-tx.service.js";

@Global()
@Module({
  providers: [PrismaService, TenantTx],
  exports: [PrismaService, TenantTx]
})
export class PrismaModule {}
