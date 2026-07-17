import { z } from "zod";

export const databaseMigrationItemSchema = z.object({
  name: z.string().min(1),
  file_name: z.string().min(1),
  applied: z.boolean()
});

export const databaseMigrationAppliedDetailSchema = z.object({
  name: z.string().min(1),
  run_on: z.string()
});

export const databaseMigrationStatusSchema = z.object({
  database_dir: z.string(),
  configured: z.boolean(),
  package_json_path: z.string().nullable(),
  migrations_dir: z.string().nullable(),
  migration_table_exists: z.boolean(),
  migration_files: z.array(z.string()),
  applied_migrations: z.array(z.string()),
  applied_details: z.array(databaseMigrationAppliedDetailSchema),
  pending_migrations: z.array(databaseMigrationItemSchema),
  pending_count: z.number().int().nonnegative(),
  errors: z.array(z.string()),
  checked_at: z.string()
});

export const databaseMigrationRunResponseSchema = z.object({
  ran: z.boolean(),
  before: databaseMigrationStatusSchema,
  after: databaseMigrationStatusSchema,
  stdout: z.string(),
  stderr: z.string()
});

export type DatabaseMigrationItem = z.infer<typeof databaseMigrationItemSchema>;
export type DatabaseMigrationStatus = z.infer<typeof databaseMigrationStatusSchema>;
export type DatabaseMigrationRunResponse = z.infer<typeof databaseMigrationRunResponseSchema>;
