import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { DatabaseService } from "./database.service.js";

@Injectable()
export class DatabaseSchemaGuard implements OnModuleInit {
  private readonly logger = new Logger(DatabaseSchemaGuard.name);

  constructor(private readonly database: DatabaseService) {}

  async onModuleInit(): Promise<void> {
    if (!this.database.isConfigured()) {
      return;
    }
    await this.ensureEmployeeCardColumns();
  }

  private async ensureEmployeeCardColumns(): Promise<void> {
    await this.database.query(`
      ALTER TABLE IF EXISTS "cards"
        ADD COLUMN IF NOT EXISTS "avatar_url" TEXT
    `);
    this.logger.log("database schema guard checked employee card columns");
  }
}
