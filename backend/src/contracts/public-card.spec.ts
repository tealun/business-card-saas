import { demoPublicCard } from "../fixtures/demo-cards.js";
import { publicCardResponseSchema } from "./public-card.js";

describe("public card contract", () => {
  it("accepts controlled intro content blocks from the demo company", () => {
    expect(publicCardResponseSchema.parse(demoPublicCard).company_profile.intro_blocks).toEqual(
      demoPublicCard.company_profile.intro_blocks
    );
  });

  it("rejects arbitrary intro HTML blocks in public responses", () => {
    const parsed = publicCardResponseSchema.safeParse({
      ...demoPublicCard,
      company_profile: {
        ...demoPublicCard.company_profile,
        intro_blocks: [{ type: "html", html: "<script>alert(1)</script>" }]
      }
    });

    expect(parsed.success).toBe(false);
  });
});
