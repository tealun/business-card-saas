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

  it.each(["0", "false", "no", "off", ""])(
    "treats DEMO_AUTH_ENABLED=%p as disabled (not the string-truthiness trap)",
    (value) => {
      process.env.NODE_ENV = "production";
      process.env.DATABASE_URL = "postgres://localhost/business-card-prod";
      process.env.DEMO_AUTH_ENABLED = value;
      const config = new AppConfig();
      expect(config.demoAuthEnabled).toBe(false);
    }
  );

  it("enables DEMO_AUTH_ENABLED for explicit truthy tokens outside production", () => {
    process.env.NODE_ENV = "development";
    process.env.DEMO_AUTH_ENABLED = "1";
    expect(new AppConfig().demoAuthEnabled).toBe(true);
  });

  it("rejects an invalid base64 encryption key", () => {
    process.env.CARD_FIELD_ENCRYPTION_KEY_BASE64 = "not-valid-base64!!!";
    expect(() => new AppConfig()).toThrow("CARD_FIELD_ENCRYPTION_KEY_BASE64");
  });

  it("defaults to local storage under the backend runtime directory", () => {
    delete process.env.STORAGE_DRIVER;
    delete process.env.STORAGE_LOCAL_ROOT;
    delete process.env.STORAGE_PUBLIC_BASE_URL;
    delete process.env.STORAGE_MAX_VIDEO_UPLOAD_BYTES;
    const config = new AppConfig();
    expect(config.storageDriver).toBe("local");
    expect(config.storageLocalRoot).toContain("storage");
    expect(config.storagePublicBaseUrl).toBe("/api/v1/storage");
    expect(config.storageMaxVideoUploadBytes).toBe(500 * 1024 * 1024);
  });

  it("uses a configured local storage root before falling back to the default path", () => {
    process.env.STORAGE_DRIVER = "local";
    process.env.STORAGE_LOCAL_ROOT = "custom-local-storage";
    const config = new AppConfig();

    expect(config.storageLocalRoot).toContain("custom-local-storage");
  });

  it("requires Alibaba Cloud OSS connection settings when aliyun_oss storage is selected", () => {
    process.env.STORAGE_DRIVER = "aliyun_oss";
    delete process.env.ALIYUN_OSS_BUCKET;
    expect(() => new AppConfig()).toThrow("ALIYUN_OSS_BUCKET is required when STORAGE_DRIVER=aliyun_oss");
  });

  it("requires S3-compatible connection settings when s3 storage is selected", () => {
    process.env.STORAGE_DRIVER = "s3";
    delete process.env.S3_BUCKET;
    expect(() => new AppConfig()).toThrow("S3_BUCKET is required when STORAGE_DRIVER=s3");
  });
});
