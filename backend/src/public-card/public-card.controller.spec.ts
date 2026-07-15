import { Test } from "@nestjs/testing";
import { FastifyAdapter, NestFastifyApplication } from "@nestjs/platform-fastify";
import { AppModule } from "../app.module.js";
import { demoPublicCard } from "../fixtures/demo-cards.js";
import { PublicCardRepository } from "./public-card.repository.js";
import { SessionTokenService } from "../session/session-token.service.js";

interface ActionBody {
  idempotent: boolean;
}

function dataOf<T>(body: string): T {
  const envelope = JSON.parse(body) as { code: number; data: T; trace_id: string };
  expect(envelope.code).toBe(0);
  expect(envelope.trace_id).toBeTruthy();
  return envelope.data;
}

describe("PublicCardController", () => {
  let app: NestFastifyApplication;
  const originalDatabaseUrl = process.env.DATABASE_URL;

  beforeAll(async () => {
    delete process.env.DATABASE_URL;
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule]
    }).compile();

    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    app.setGlobalPrefix("api/v1");
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    await app.close();
    if (originalDatabaseUrl) {
      process.env.DATABASE_URL = originalDatabaseUrl;
    }
  });

  it("serves cached public content without visit_token", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/public/cards/pub_demo0001"
    });
    expect(response.statusCode).toBe(200);
    const body = dataOf<Record<string, unknown>>(response.body);
    expect(body.public_id).toBe("pub_demo0001");
    expect((body.card as { display_name: string }).display_name).toBe("M1 Demo Employee");
    expect(body.template).toBeTruthy();
    expect(body.company_profile).toBeTruthy();
    expect(Array.isArray(body.videos)).toBe(true);
    expect(Array.isArray(body.honors)).toBe(true);
    expect(((body.company_profile as { display_modules: unknown[] }).display_modules).map((item) => (item as { key: string }).key)).toEqual([
      "services",
      "profile",
      "videos",
      "honors"
    ]);
    expect((body.company_profile as { service_items: unknown[] }).service_items.length).toBeGreaterThanOrEqual(5);
    expect((body.videos as unknown[]).length).toBeGreaterThanOrEqual(1);
    expect((body.honors as unknown[]).length).toBeGreaterThanOrEqual(2);
    expect(response.body).not.toContain("images.unsplash.com");
    expect(response.body).not.toContain("interactive-examples.mdn.mozilla.net");
    expect(response.body).toContain("/api/v1/demo-assets/company/");
    expect(body.visit_token).toBeUndefined();
  });

  it("serves bundled demo company assets from the backend origin", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/demo-assets/company/service-identity.png"
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toBe("image/png");
    expect(Number(response.headers["content-length"])).toBeGreaterThan(0);
  });

  it("creates a visit and records idempotent actions with visit_token", async () => {
    const visitResponse = await app.inject({
      method: "POST",
      url: "/api/v1/public/cards/pub_demo0001/visit",
      payload: { share: "shr_demo0001" }
    });
    expect(visitResponse.statusCode).toBe(201);
    const visit = dataOf<{
      visit_id: string;
      anon_id: string;
      visit_token: string;
    }>(visitResponse.body);

    expect(visit.visit_id).toMatch(/^vis_/);
    expect(visit.anon_id).toMatch(/^anon_/);
    expect(visit.visit_token).toBeTruthy();

    const firstAction = await app.inject({
      method: "POST",
      url: "/api/v1/public/cards/pub_demo0001/actions",
      headers: { authorization: `Bearer ${visit.visit_token}` },
      payload: { action_type: "save_phone" }
    });
    expect(firstAction.statusCode).toBe(201);
    expect(dataOf<ActionBody>(firstAction.body).idempotent).toBe(false);

    const secondAction = await app.inject({
      method: "POST",
      url: "/api/v1/public/cards/pub_demo0001/actions",
      headers: { authorization: `Bearer ${visit.visit_token}` },
      payload: { action_type: "save_phone" }
    });
    expect(secondAction.statusCode).toBe(201);
    expect(dataOf<ActionBody>(secondAction.body).idempotent).toBe(true);
  });

  it("signs anon_id, reuses a valid one, and re-issues on a forged one (A12-P1-1)", async () => {
    const first = await app.inject({
      method: "POST",
      url: "/api/v1/public/cards/pub_demo0001/visit",
      payload: {}
    });
    const firstVisit = dataOf<{ anon_id: string }>(first.body);
    expect(firstVisit.anon_id).toContain(".");

    // A correctly signed anon_id sent back by the client is honored as-is.
    const reused = await app.inject({
      method: "POST",
      url: "/api/v1/public/cards/pub_demo0001/visit",
      payload: { anon_id: firstVisit.anon_id }
    });
    expect(dataOf<{ anon_id: string }>(reused.body).anon_id).toBe(firstVisit.anon_id);

    // A well-formed but unsigned/forged anon_id is discarded and a fresh one issued.
    const forged = await app.inject({
      method: "POST",
      url: "/api/v1/public/cards/pub_demo0001/visit",
      payload: { anon_id: "anon_forgedforgedforged.deadbeef" }
    });
    expect(dataOf<{ anon_id: string }>(forged.body).anon_id).not.toBe("anon_forgedforgedforged.deadbeef");
  });

  it("counts visits separately from visitors and deduplicates likes per anon visitor", async () => {
    const first = await app.inject({
      method: "POST",
      url: "/api/v1/public/cards/pub_demo0001/visit",
      payload: {}
    });
    const firstVisit = dataOf<{ anon_id: string; visit_token: string; stats: { visitor_count: number; visit_count: number } }>(first.body);

    const second = await app.inject({
      method: "POST",
      url: "/api/v1/public/cards/pub_demo0001/visit",
      payload: { anon_id: firstVisit.anon_id }
    });
    const secondVisit = dataOf<{ visit_token: string; stats: { visitor_count: number; visit_count: number } }>(second.body);

    expect(secondVisit.stats.visitor_count).toBe(firstVisit.stats.visitor_count);
    expect(secondVisit.stats.visit_count).toBe(firstVisit.stats.visit_count + 1);

    const firstLike = await app.inject({
      method: "POST",
      url: "/api/v1/public/cards/pub_demo0001/actions",
      headers: { authorization: `Bearer ${firstVisit.visit_token}` },
      payload: { action_type: "like_card" }
    });
    expect(firstLike.statusCode).toBe(201);
    expect(dataOf<{ idempotent: boolean; stats: { like_count: number } }>(firstLike.body).idempotent).toBe(false);

    const secondLike = await app.inject({
      method: "POST",
      url: "/api/v1/public/cards/pub_demo0001/actions",
      headers: { authorization: `Bearer ${secondVisit.visit_token}` },
      payload: { action_type: "like_card" }
    });
    const secondLikeBody = dataOf<{ idempotent: boolean; stats: { like_count: number } }>(secondLike.body);
    expect(secondLikeBody.idempotent).toBe(true);
    expect(secondLikeBody.stats.like_count).toBe(dataOf<{ stats: { like_count: number } }>(firstLike.body).stats.like_count);
  });

  it("treats anonymous visitors without a current anon_id as new visitors", async () => {
    const first = await app.inject({
      method: "POST",
      url: "/api/v1/public/cards/pub_demo0001/visit",
      headers: { "x-forwarded-for": "203.0.113.10" },
      payload: { fingerprint: "ios|iphone15|390x844" }
    });
    const firstVisit = dataOf<{ stats: { visitor_count: number; visit_count: number } }>(first.body);

    const second = await app.inject({
      method: "POST",
      url: "/api/v1/public/cards/pub_demo0001/visit",
      headers: { "x-forwarded-for": "203.0.113.10" },
      payload: { fingerprint: "ios|iphone15|390x844" }
    });
    const secondVisit = dataOf<{ stats: { visitor_count: number; visit_count: number } }>(second.body);

    expect(secondVisit.stats.visitor_count).toBe(firstVisit.stats.visitor_count + 1);
    expect(secondVisit.stats.visit_count).toBe(firstVisit.stats.visit_count + 1);
  });

  it("does not count owner preview visits", async () => {
    const tokens = app.get(SessionTokenService);
    const ownerToken = tokens.sign({
      accountId: "acct-owner",
      tenantId: "tenant-owner",
      memberIdentityId: "member-owner",
      openUserid: "ou-owner",
      publicId: "pub_demo0001"
    });
    const first = await app.inject({
      method: "POST",
      url: "/api/v1/public/cards/pub_demo0001/visit",
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: {}
    });
    const firstVisit = dataOf<{ stats: { visitor_count: number; visit_count: number } }>(first.body);

    const second = await app.inject({
      method: "POST",
      url: "/api/v1/public/cards/pub_demo0001/visit",
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: {}
    });
    const secondVisit = dataOf<{ stats: { visitor_count: number; visit_count: number } }>(second.body);

    expect(secondVisit.stats).toEqual(firstVisit.stats);
  });

  it("rejects action reports without a visit_token", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/public/cards/pub_demo0001/actions",
      payload: { action_type: "save_phone" }
    });

    expect(response.statusCode).toBe(401);
  });

  it("rejects visit_token reuse across public cards", async () => {
    const visitResponse = await app.inject({
      method: "POST",
      url: "/api/v1/public/cards/pub_demo0001/visit",
      payload: { share: "shr_demo0001" }
    });
    expect(visitResponse.statusCode).toBe(201);
    const visit = dataOf<{ visit_token: string }>(visitResponse.body);

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/public/cards/pub_other0001/actions",
      headers: { authorization: `Bearer ${visit.visit_token}` },
      payload: { action_type: "save_phone" }
    });

    expect(response.statusCode).toBe(401);
  });

  it("derives a customer reshare id from the visit_token scope", async () => {
    const visitResponse = await app.inject({
      method: "POST",
      url: "/api/v1/public/cards/pub_demo0001/visit",
      payload: { share: "shr_demo0001" }
    });
    expect(visitResponse.statusCode).toBe(201);
    const visit = dataOf<{ visit_token: string }>(visitResponse.body);

    const deriveResponse = await app.inject({
      method: "POST",
      url: "/api/v1/public/cards/pub_demo0001/shares/derive",
      headers: { authorization: `Bearer ${visit.visit_token}` },
      payload: { parent_share_id: "shr_demo0001" }
    });

    expect(deriveResponse.statusCode).toBe(201);
    const share = dataOf<{
      share_id: string;
      parent_share_id: string;
      depth: number;
      capped: boolean;
    }>(deriveResponse.body);
    expect(share.share_id).toMatch(/^shr_/);
    expect(share.share_id).not.toBe("shr_demo0001");
    expect(share.parent_share_id).toBe("shr_demo0001");
    expect(share.depth).toBe(1);
    expect(share.capped).toBe(false);
  });

  it("rejects derived shares when card forwarding is disabled", async () => {
    const repository = app.get(PublicCardRepository);
    await repository.upsertPublicCard({
      ...demoPublicCard,
      public_id: "pub_nofwd001",
      allow_forward: false
    });
    await repository.registerRootShare({
      publicId: "pub_nofwd001",
      shareId: "shr_nofwd001"
    });
    const visitResponse = await app.inject({
      method: "POST",
      url: "/api/v1/public/cards/pub_nofwd001/visit",
      payload: { share: "shr_nofwd001" }
    });
    expect(visitResponse.statusCode).toBe(201);
    const visit = dataOf<{ visit_token: string }>(visitResponse.body);

    const deriveResponse = await app.inject({
      method: "POST",
      url: "/api/v1/public/cards/pub_nofwd001/shares/derive",
      headers: { authorization: `Bearer ${visit.visit_token}` },
      payload: { parent_share_id: "shr_nofwd001" }
    });

    expect(deriveResponse.statusCode).toBe(403);
  });

  it("rejects derived shares without a visit_token", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/public/cards/pub_demo0001/shares/derive",
      payload: { parent_share_id: "shr_demo0001" }
    });

    expect(response.statusCode).toBe(401);
  });
});
