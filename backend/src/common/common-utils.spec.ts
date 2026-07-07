import { defaultEmployeeCardSlug, defaultEmployeePublicId } from "./default-public-id.js";
import { randomToken } from "./id.js";
import { readSecret } from "./secrets.js";

describe("common utilities", () => {
  describe("randomToken", () => {
    it("generates a token with the default byte length", () => {
      const token = randomToken("test");
      expect(token).toMatch(/^test_[A-Za-z0-9_-]+$/);
    });

    it("generates a token with a custom byte length", () => {
      const token = randomToken("test", 8);
      expect(token).toMatch(/^test_[A-Za-z0-9_-]+$/);
    });
  });

  describe("readSecret", () => {
    const originalEnv = process.env;

    beforeEach(() => {
      process.env = { ...originalEnv };
    });

    afterAll(() => {
      process.env = originalEnv;
    });

    it("returns the trimmed environment value", () => {
      process.env.TEST_SECRET_VALUE = "  secret-value  ";
      expect(readSecret("TEST_SECRET_VALUE")).toBe("secret-value");
    });

    it("throws when the environment variable is missing", () => {
      delete process.env.TEST_SECRET_VALUE;
      expect(() => readSecret("TEST_SECRET_VALUE")).toThrow("TEST_SECRET_VALUE must be set");
    });
  });

  describe("defaultEmployeeCardSlug", () => {
    it("derives a stable slug from tenant and member identity", () => {
      const slug = defaultEmployeeCardSlug({ tenantId: "tenant-001", memberIdentityId: "member-001" });
      expect(slug).toMatch(/^card-[A-Za-z0-9_-]+$/);
      expect(slug).toBe(defaultEmployeeCardSlug({ tenantId: "tenant-001", memberIdentityId: "member-001" }));
    });

    it("produces a public id with the pub_ prefix", () => {
      const id = defaultEmployeePublicId({ tenantId: "tenant-001", memberIdentityId: "member-001" });
      expect(id).toMatch(/^pub_[A-Za-z0-9_-]+$/);
    });
  });
});
