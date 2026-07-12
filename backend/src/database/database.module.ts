import { Global, Module } from "@nestjs/common";
import { DatabaseService } from "./database.service.js";
import { TenantTx } from "./tenant-tx.service.js";

@Global()
@Module({
  providers: [DatabaseService, TenantTx],
  exports: [DatabaseService, TenantTx]
})
export class DatabaseModule {}
