import { Injectable } from "@nestjs/common";
import path from "node:path";
import { z } from "zod";

function base64Key(name: string) {
  return z.string().refine(
    (value) => {
      const buffer = Buffer.from(value, "base64");
      return buffer.length === 32;
    },
    { message: `${name} must be a base64-encoded 32-byte key` }
  );
}

const databaseUrl = z.string().min(1).refine((value) => /^postgres(ql)?:\/\//.test(value), {
  message: 'DATABASE_URL must start with "postgres://" or "postgresql://"'
});

// Env values are always strings, so `z.coerce.boolean()` would treat "0"/"false"
// as `true` (any non-empty string is truthy). Parse a fixed token set instead so
// "0"/"false"/""/unset all mean false and only explicit truthy tokens enable it.
function booleanFlag(defaultValue: boolean) {
  return z
    .preprocess(
      (value) => (typeof value === "string" ? value.trim().toLowerCase() : value),
      z.enum(["1", "0", "true", "false", "yes", "no", "on", "off", ""]).optional()
    )
    .transform((value) => {
      if (value === undefined || value === "") {
        return defaultValue;
      }
      return value === "1" || value === "true" || value === "yes" || value === "on";
    });
}

const appConfigSchema = z
  .object({
    NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
    PORT: z.coerce.number().int().positive().default(3000),
    HOST: z.string().min(1).default("0.0.0.0"),
    CORS_ORIGINS: z.string().default(""),

    DATABASE_URL: databaseUrl.optional(),
    DATABASE_POOL_MAX: z.coerce.number().int().positive().default(10),
    DATABASE_CONNECT_TIMEOUT_MS: z.coerce.number().int().positive().default(5_000),
    DATABASE_IDLE_TIMEOUT_MS: z.coerce.number().int().positive().default(30_000),
    DATABASE_STATEMENT_TIMEOUT_MS: z.coerce.number().int().positive().default(15_000),
    DATABASE_SSL: z.enum(["disable", "require"]).default("disable"),
    DATABASE_APPLICATION_NAME: z.string().min(1).default("business-card-backend"),
    DATABASE_DIR: z.string().optional().or(z.literal("")),

    JWT_SECRET: z.string().min(32),
    ADMIN_JWT_SECRET: z.string().min(32),
    VISIT_TOKEN_SECRET: z.string().min(32),
    CARD_FIELD_ENCRYPTION_KEY_BASE64: base64Key("CARD_FIELD_ENCRYPTION_KEY_BASE64"),
    WECOM_STATE_ENCRYPTION_KEY_BASE64: base64Key("WECOM_STATE_ENCRYPTION_KEY_BASE64"),
    DEMO_AUTH_ENABLED: booleanFlag(false),

    WECOM_PROVIDER_CORP_ID: z.string().regex(/^ww[A-Za-z0-9_-]+$/, "must be a WeCom CorpID"),
    WECOM_SUITE_ID: z.string().regex(/^ww[A-Za-z0-9_-]+$/, "must be a WeCom SuiteID"),
    WECOM_SUITE_SECRET: z.string().min(1),
    WECOM_CALLBACK_TOKEN: z.string().min(1),
    WECOM_CALLBACK_AES_KEY: z.string().length(43),
    WECOM_DATA_CALLBACK_TOKEN: z.string().min(1),
    WECOM_DATA_CALLBACK_AES_KEY: z.string().length(43),
    WECOM_API_BASE_URL: z.string().url(),
    WECOM_HTTP_TIMEOUT_MS: z.coerce.number().int().positive(),
    WECOM_INSTALL_BASE_URL: z.string().url(),
    WECOM_INSTALL_REDIRECT_URI: z.string().url(),
    WECOM_SENSITIVE_REDIRECT_URI: z.string().url(),
    WECOM_AUTH_LAUNCH_TOKEN: z.string().min(1),

    WECOM_CALLBACK_ALERT_WEBHOOK_URL: z.string().url().optional().or(z.literal("")),
    WECOM_CALLBACK_ALERT_WEBHOOK_TOKEN: z.string().min(1).optional().or(z.literal("")),

    WECHAT_MINIPROGRAM_APPID: z.string().min(1).optional().or(z.literal("")),
    WECHAT_MINIPROGRAM_SECRET: z.string().min(1).optional().or(z.literal("")),
    WECHAT_HTTP_TIMEOUT_MS: z.coerce.number().int().positive().default(5000),

    STORAGE_DRIVER: z.enum(["local", "aliyun_oss", "s3"]).default("local"),
    STORAGE_LOCAL_ROOT: z.string().min(1).optional().or(z.literal("")),
    STORAGE_PUBLIC_BASE_URL: z.string().min(1).optional().or(z.literal("")),
    STORAGE_MAX_UPLOAD_BYTES: z.coerce.number().int().positive().default(5 * 1024 * 1024),
    ALIYUN_OSS_BUCKET: z.string().min(1).optional().or(z.literal("")),
    ALIYUN_OSS_REGION: z.string().min(1).optional().or(z.literal("")),
    ALIYUN_OSS_ENDPOINT: z.string().min(1).optional().or(z.literal("")),
    ALIYUN_OSS_ACCESS_KEY_ID: z.string().min(1).optional().or(z.literal("")),
    ALIYUN_OSS_ACCESS_KEY_SECRET: z.string().min(1).optional().or(z.literal("")),
    S3_BUCKET: z.string().min(1).optional().or(z.literal("")),
    S3_REGION: z.string().min(1).optional().or(z.literal("")),
    S3_ENDPOINT: z.string().min(1).optional().or(z.literal("")),
    S3_ACCESS_KEY_ID: z.string().min(1).optional().or(z.literal("")),
    S3_SECRET_ACCESS_KEY: z.string().min(1).optional().or(z.literal("")),
    S3_FORCE_PATH_STYLE: booleanFlag(false),

    // Bearer token required to scrape GET /api/v1/metrics. Unset => endpoint disabled (A54-P1-1).
    METRICS_TOKEN: z.string().min(1).optional().or(z.literal("")),

    // Initial super admin for the admin console. Only used to create the
    // account when the username does not exist yet; changing the password in
    // the console makes these values inert.
    ADMIN_BOOTSTRAP_USERNAME: z.string().min(1).max(64).optional().or(z.literal("")),
    ADMIN_BOOTSTRAP_PASSWORD: z.string().min(8).max(128).optional().or(z.literal(""))
  })
  .superRefine((data, ctx) => {
    const bootstrapUsername = data.ADMIN_BOOTSTRAP_USERNAME?.trim();
    const bootstrapPassword = data.ADMIN_BOOTSTRAP_PASSWORD;
    if (Boolean(bootstrapUsername) !== Boolean(bootstrapPassword)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "ADMIN_BOOTSTRAP_USERNAME and ADMIN_BOOTSTRAP_PASSWORD must be set together",
        path: ["ADMIN_BOOTSTRAP_USERNAME"]
      });
    }
    if (data.NODE_ENV === "production" && !data.DATABASE_URL) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "DATABASE_URL is required in production",
        path: ["DATABASE_URL"]
      });
    }
    if (data.NODE_ENV === "production" && data.DEMO_AUTH_ENABLED) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "DEMO_AUTH_ENABLED must be disabled in production",
        path: ["DEMO_AUTH_ENABLED"]
      });
    }
    if (data.NODE_ENV === "production") {
      for (const key of ["WECOM_PROVIDER_CORP_ID", "WECOM_SUITE_ID", "WECOM_SUITE_SECRET"] as const) {
        if (/xxx|example|change|your/i.test(data[key])) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `${key} must not contain a placeholder in production`,
            path: [key]
          });
        }
      }
    }
    if (data.STORAGE_DRIVER === "aliyun_oss") {
      for (const key of [
        "ALIYUN_OSS_BUCKET",
        "ALIYUN_OSS_REGION",
        "ALIYUN_OSS_ENDPOINT",
        "ALIYUN_OSS_ACCESS_KEY_ID",
        "ALIYUN_OSS_ACCESS_KEY_SECRET"
      ] as const) {
        if (!data[key]?.trim()) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `${key} is required when STORAGE_DRIVER=aliyun_oss`,
            path: [key]
          });
        }
      }
    }
    if (data.STORAGE_DRIVER === "s3") {
      for (const key of ["S3_BUCKET", "S3_REGION", "S3_ENDPOINT", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY"] as const) {
        if (!data[key]?.trim()) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `${key} is required when STORAGE_DRIVER=s3`,
            path: [key]
          });
        }
      }
    }
  });

export type AppConfigValues = z.infer<typeof appConfigSchema>;

@Injectable()
export class AppConfig {
  readonly values: AppConfigValues;

  constructor() {
    const parsed = appConfigSchema.safeParse(process.env);
    if (!parsed.success) {
      const issues = parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ");
      throw new Error(`Invalid application configuration: ${issues}`);
    }
    this.values = parsed.data;
  }

  get nodeEnv(): AppConfigValues["NODE_ENV"] {
    return this.values.NODE_ENV;
  }

  get isProduction(): boolean {
    return this.values.NODE_ENV === "production";
  }

  get port(): number {
    return this.values.PORT;
  }

  get host(): string {
    return this.values.HOST;
  }

  get corsOrigins(): string[] {
    return this.values.CORS_ORIGINS.split(",").map((item) => item.trim()).filter(Boolean);
  }

  get databaseUrl(): string | undefined {
    return this.values.DATABASE_URL;
  }

  get databasePoolMax(): number {
    return this.values.DATABASE_POOL_MAX;
  }

  get databaseConnectTimeoutMs(): number {
    return this.values.DATABASE_CONNECT_TIMEOUT_MS;
  }

  get databaseIdleTimeoutMs(): number {
    return this.values.DATABASE_IDLE_TIMEOUT_MS;
  }

  get databaseStatementTimeoutMs(): number {
    return this.values.DATABASE_STATEMENT_TIMEOUT_MS;
  }

  get databaseSsl(): "disable" | "require" {
    return this.values.DATABASE_SSL;
  }

  get databaseApplicationName(): string {
    return this.values.DATABASE_APPLICATION_NAME;
  }

  get databaseDir(): string {
    return this.values.DATABASE_DIR ?? "";
  }

  get adminBootstrapUsername(): string {
    return this.values.ADMIN_BOOTSTRAP_USERNAME ?? "";
  }

  get adminBootstrapPassword(): string {
    return this.values.ADMIN_BOOTSTRAP_PASSWORD ?? "";
  }

  get demoAuthEnabled(): boolean {
    return this.values.DEMO_AUTH_ENABLED;
  }

  get wechatMiniProgramAppId(): string {
    return this.values.WECHAT_MINIPROGRAM_APPID ?? "";
  }

  get wechatMiniProgramSecret(): string {
    return this.values.WECHAT_MINIPROGRAM_SECRET ?? "";
  }

  get wechatHttpTimeoutMs(): number {
    return this.values.WECHAT_HTTP_TIMEOUT_MS;
  }

  get metricsToken(): string {
    return this.values.METRICS_TOKEN ?? "";
  }

  get storageDriver(): "local" | "aliyun_oss" | "s3" {
    return this.values.STORAGE_DRIVER;
  }

  get storageLocalRoot(): string {
    return path.resolve(process.cwd(), this.values.STORAGE_LOCAL_ROOT?.trim() || "storage/uploads");
  }

  get storagePublicBaseUrl(): string {
    return (this.values.STORAGE_PUBLIC_BASE_URL?.trim() || "/api/v1/storage").replace(/\/$/, "");
  }

  get storageMaxUploadBytes(): number {
    return this.values.STORAGE_MAX_UPLOAD_BYTES;
  }

  get aliyunOssConfig(): {
    bucket: string;
    region: string;
    endpoint: string;
    accessKeyId: string;
    accessKeySecret: string;
  } {
    return {
      bucket: this.values.ALIYUN_OSS_BUCKET ?? "",
      region: this.values.ALIYUN_OSS_REGION ?? "",
      endpoint: this.values.ALIYUN_OSS_ENDPOINT ?? "",
      accessKeyId: this.values.ALIYUN_OSS_ACCESS_KEY_ID ?? "",
      accessKeySecret: this.values.ALIYUN_OSS_ACCESS_KEY_SECRET ?? ""
    };
  }

  get s3Config(): {
    bucket: string;
    region: string;
    endpoint: string;
    accessKeyId: string;
    secretAccessKey: string;
    forcePathStyle: boolean;
  } {
    return {
      bucket: this.values.S3_BUCKET ?? "",
      region: this.values.S3_REGION ?? "",
      endpoint: this.values.S3_ENDPOINT ?? "",
      accessKeyId: this.values.S3_ACCESS_KEY_ID ?? "",
      secretAccessKey: this.values.S3_SECRET_ACCESS_KEY ?? "",
      forcePathStyle: this.values.S3_FORCE_PATH_STYLE
    };
  }
}
