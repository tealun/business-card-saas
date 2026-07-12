import { Global, Module } from "@nestjs/common";
import { DatabaseSchemaGuard } from "./database-schema-guard.service.js";
import { DatabaseService } from "./database.service.js";
import { TenantTx } from "./tenant-tx.service.js";

@Global()
@Module({
  providers: [DatabaseService, DatabaseSchemaGuard, TenantTx],
  exports: [DatabaseService, TenantTx]
})
export class DatabaseModule {}
