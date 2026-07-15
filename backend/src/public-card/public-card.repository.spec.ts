import { demoPublicCard } from "../fixtures/demo-cards.js";
import { PublicCardRepository } from "./public-card.repository.js";

describe("PublicCardRepository", () => {
  it("returns isolated copies of modular company profile data", async () => {
    const repository = new PublicCardRepository();

    const first = await repository.findPublicCard("pub_demo0001");
    first.company_profile.intro_blocks[0] = { type: "heading", text: "Mutated intro" };
    first.company_profile.service_items[0] = {
      id: "service_mutated",
      title: "Mutated service",
      description: "",
      image_url: null,
      visible: true,
      sort_order: 0
    };
    first.company_profile.display_modules[0] = {
      key: "services",
      title: "Mutated module",
      visible: false,
      sort_order: 99,
      layout: "text"
    };

    const second = await repository.findPublicCard("pub_demo0001");

    expect(second.company_profile.intro_blocks[0]).not.toEqual({ type: "heading", text: "Mutated intro" });
    expect(second.company_profile.service_items[0]?.title).toBe(demoPublicCard.company_profile.service_items[0]?.title);
    expect(second.company_profile.display_modules[0]?.title).toBe(demoPublicCard.company_profile.display_modules[0]?.title);
    expect(second.company_profile.display_modules[0]?.visible).toBe(true);
  });
});
