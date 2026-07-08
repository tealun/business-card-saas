import { AppConfig } from "./app-config.js";

describe("AppConfig", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("validates a complete configuration", () => {
    process.env.DATABASE_URL = "postgres://localhost/business-card-test";
    process.env.NODE_ENV = "test";
    expect(() => new AppConfig()).not.toThrow();
  });

  it("throws when a required secret is missing", () => {
    delete process.env.JWT_SECRET;
    expect(() => new AppConfig()).toThrow("Invalid application configuration");
  });

  it("requires DATABASE_URL in production", () => {
    process.env.NODE_ENV = "production";
    delete process.env.DATABASE_URL;
    expect(() => new AppConfig()).toThrow("DATABASE_URL is required in production");
  });

  it("accepts production configuration with DATABASE_URL", () => {
    process.env.NODE_ENV = "production";
    process.env.DATABASE_URL = "postgres://localhost/business-card-prod";
    expect(() => new AppConfig()).not.toThrow();
  });

  it("accepts the standard postgresql URL scheme used by compose and docs", () => {
    process.env.NODE_ENV = "production";
    process.env.DATABASE_URL = "postgresql://localhost/business-card-prod";
    expect(() => new AppConfig()).not.toThrow();
  });

  it("exposes the configured database operations directory", () => {
    process.env.DATABASE_DIR = "database";
    expect(new AppConfig().databaseDir).toBe("database");
  });

  it("rejects DEMO_AUTH_ENABLED in production", () => {
    process.env.NODE_ENV = "production";
    process.env.DATABASE_URL = "postgres://localhost/business-card-prod";
    process.env.DEMO_AUTH_ENABLED = "true";
    expect(() => new AppConfig()).toThrow("DEMO_AUTH_ENABLED must be disabled in production");
  });

  it("rejects an invalid base64 encryption key", () => {
    process.env.CARD_FIELD_ENCRYPTION_KEY_BASE64 = "not-valid-base64!!!";
    expect(() => new AppConfig()).toThrow("CARD_FIELD_ENCRYPTION_KEY_BASE64");
  });
});
