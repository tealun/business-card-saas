import { Injectable } from "@nestjs/common";
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

const appConfigSchema = z
  .object({
    NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
    PORT: z.coerce.number().int().positive().default(3000),
    HOST: z.string().min(1).default("0.0.0.0"),
    CORS_ORIGINS: z.string().default(""),

    DATABASE_URL: z.string().min(1).startsWith("postgres://").optional(),

    JWT_SECRET: z.string().min(32),
  ADMIN_JWT_SECRET: z.string().min(32),
  VISIT_TOKEN_SECRET: z.string().min(32),
  CARD_FIELD_ENCRYPTION_KEY_BASE64: base64Key("CARD_FIELD_ENCRYPTION_KEY_BASE64"),
  WECOM_STATE_ENCRYPTION_KEY_BASE64: base64Key("WECOM_STATE_ENCRYPTION_KEY_BASE64"),

  WECOM_SUITE_ID: z.string().min(1),
  WECOM_SUITE_SECRET: z.string().min(1),
  WECOM_CALLBACK_TOKEN: z.string().min(1),
  WECOM_CALLBACK_AES_KEY: z.string().length(43),
  WECOM_DATA_CALLBACK_TOKEN: z.string().min(1),
  WECOM_DATA_CALLBACK_AES_KEY: z.string().length(43),
  WECOM_API_BASE_URL: z.string().url(),
  WECOM_HTTP_TIMEOUT_MS: z.coerce.number().int().positive(),
  WECOM_INSTALL_BASE_URL: z.string().url(),
  WECOM_INSTALL_REDIRECT_URI: z.string().url(),
  WECOM_AUTH_LAUNCH_TOKEN: z.string().min(1),

  WECOM_CALLBACK_ALERT_WEBHOOK_URL: z.string().url().optional().or(z.literal("")),
  WECOM_CALLBACK_ALERT_WEBHOOK_TOKEN: z.string().min(1).optional().or(z.literal(""))
})
  .superRefine((data, ctx) => {
    if (data.NODE_ENV === "production" && !data.DATABASE_URL) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "DATABASE_URL is required in production",
        path: ["DATABASE_URL"]
      });
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
}
