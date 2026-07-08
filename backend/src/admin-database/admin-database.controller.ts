import { Controller, Get, Post, Req, UseGuards } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { AdminAuthGuard, type AdminRequest } from "../admin-auth/admin-auth.guard.js";
import { requireAdminSession } from "../admin-auth/admin-session.util.js";
import { AdminDatabaseService } from "./admin-database.service.js";

@Controller("admin/database")
@UseGuards(AdminAuthGuard)
export class AdminDatabaseController {
  constructor(private readonly databaseOps: AdminDatabaseService) {}

  @Get("migrations")
  migrations(@Req() request: AdminRequest) {
    return this.databaseOps.getMigrationStatus(requireAdminSession(request));
  }

  @Post("migrations/run")
  @Throttle({ adminMutation: { ttl: 300_000, limit: 3 } })
  runMigrations(@Req() request: AdminRequest) {
    return this.databaseOps.runPendingMigrations(requireAdminSession(request));
  }
}
