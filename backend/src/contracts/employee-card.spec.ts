import { updateEmployeeCardRequestSchema } from "./employee-card.js";

describe("employee card image contracts", () => {
  it("rejects WeChat DevTools temporary image URLs", () => {
    const result = updateEmployeeCardRequestSchema.safeParse({
      avatar_url: "http://127.0.0.1:47512/**tmp**/avatar.jpeg"
    });

    expect(result.success).toBe(false);
  });

  it("accepts persistent HTTPS image URLs", () => {
    const result = updateEmployeeCardRequestSchema.safeParse({
      avatar_url: "https://wecomcard.example.com/api/v1/storage/avatars/avatar.jpeg"
    });

    expect(result.success).toBe(true);
  });
});
