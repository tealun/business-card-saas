import { updateEmployeeCardRequestSchema, updateEmployeeCardStyleRequestSchema } from "./employee-card.js";

describe("employee card image contracts", () => {
  it("rejects WeChat DevTools temporary image URLs", () => {
    const result = updateEmployeeCardRequestSchema.safeParse({
      avatar_url: "http://127.0.0.1:47512/**tmp**/avatar.jpeg"
    });

    expect(result.success).toBe(false);
  });

  it("rejects WeChat http://tmp image URLs for avatars and logos", () => {
    const avatar = updateEmployeeCardRequestSchema.safeParse({
      avatar_url: "http://tmp/4O0FzR0xI7eJ5f/avatar.jpeg"
    });
    const logo = updateEmployeeCardStyleRequestSchema.safeParse({
      logo_url: "http://tmp/4O0FzR0xI7eJ5f/logo.png"
    });

    expect(avatar.success).toBe(false);
    expect(logo.success).toBe(false);
  });

  it("accepts persistent HTTPS image URLs", () => {
    const result = updateEmployeeCardRequestSchema.safeParse({
      avatar_url: "https://wecomcard.example.com/api/v1/storage/avatars/avatar.jpeg"
    });

    expect(result.success).toBe(true);
  });

  it("keeps a local backend storage URL valid during development", () => {
    const result = updateEmployeeCardRequestSchema.safeParse({
      avatar_url: "http://localhost:3030/api/v1/storage/tenant/demo/avatars/avatar.jpeg"
    });

    expect(result.success).toBe(true);
  });
});
