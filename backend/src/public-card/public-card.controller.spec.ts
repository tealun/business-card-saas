import { Test } from "@nestjs/testing";
import { FastifyAdapter, NestFastifyApplication } from "@nestjs/platform-fastify";
import { AppModule } from "../app.module.js";

interface ActionBody {
  idempotent: boolean;
}

describe("PublicCardController", () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
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
  });

  it("serves cached public content without visit_token", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/public/cards/pub_demo0001"
    });
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body) as Record<string, unknown>;
    expect(body.public_id).toBe("pub_demo0001");
    expect(body.visit_token).toBeUndefined();
  });

  it("creates a visit and records idempotent actions with visit_token", async () => {
    const visitResponse = await app.inject({
      method: "POST",
      url: "/api/v1/public/cards/pub_demo0001/visit",
      payload: { share: "shr_demo0001" }
    });
    expect(visitResponse.statusCode).toBe(201);
    const visit = JSON.parse(visitResponse.body) as {
      visit_id: string;
      anon_id: string;
      visit_token: string;
    };

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
    expect((JSON.parse(firstAction.body) as ActionBody).idempotent).toBe(false);

    const secondAction = await app.inject({
      method: "POST",
      url: "/api/v1/public/cards/pub_demo0001/actions",
      headers: { authorization: `Bearer ${visit.visit_token}` },
      payload: { action_type: "save_phone" }
    });
    expect(secondAction.statusCode).toBe(201);
    expect((JSON.parse(secondAction.body) as ActionBody).idempotent).toBe(true);
  });
});
