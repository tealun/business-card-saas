import { adminWecomScanCallbackQuerySchema } from "./admin-auth.js";

describe("admin auth contracts", () => {
  it("accepts WeCom scan callbacks that use auth_code instead of code", () => {
    const result = adminWecomScanCallbackQuerySchema.parse({
      auth_code: "oauth-code-001",
      state: "state-token-00000000000000000000000000000001"
    });

    expect(result).toEqual({
      code: "oauth-code-001",
      state: "state-token-00000000000000000000000000000001"
    });
  });
});
