import { Test } from "@nestjs/testing";
import { FastifyAdapter, NestFastifyApplication } from "@nestjs/platform-fastify";
import { AppModule } from "../app.module.js";

describe("Auth and employee card flow", () => {
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

  it("rejects employee current card without a bearer token", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/employee/cards/current"
    });

    expect(response.statusCode).toBe(401);
  });

  it("logs in with qy-login and reads the current employee card", async () => {
    const loginResponse = await app.inject({
      method: "POST",
      url: "/api/v1/auth/qy-login",
      payload: { code: "demo-qy-code" }
    });

    expect(loginResponse.statusCode).toBe(201);
    const login = JSON.parse(loginResponse.body) as {
      access_token: string;
      current_identity: { public_id: string; open_userid: string };
    };
    expect(login.access_token).toBeTruthy();
    expect(login.current_identity.open_userid).toBe("ou_demo0001");
    expect(login.current_identity.public_id).toBe("pub_demo0001");

    const cardResponse = await app.inject({
      method: "GET",
      url: "/api/v1/employee/cards/current",
      headers: { authorization: `Bearer ${login.access_token}` }
    });

    expect(cardResponse.statusCode).toBe(200);
    const card = JSON.parse(cardResponse.body) as {
      public_id: string;
      privacy: { show_mobile: boolean };
    };
    expect(card.public_id).toBe("pub_demo0001");
    expect(card.privacy.show_mobile).toBe(false);
  });

  it("creates an employee share id for the current card", async () => {
    const loginResponse = await app.inject({
      method: "POST",
      url: "/api/v1/auth/qy-login",
      payload: { code: "demo-qy-code" }
    });
    const login = JSON.parse(loginResponse.body) as { access_token: string };

    const shareResponse = await app.inject({
      method: "POST",
      url: "/api/v1/employee/cards/current/share",
      headers: { authorization: `Bearer ${login.access_token}` }
    });

    expect(shareResponse.statusCode).toBe(201);
    const share = JSON.parse(shareResponse.body) as {
      public_id: string;
      share_id: string;
      scene: string;
      path: string;
    };
    expect(share.public_id).toBe("pub_demo0001");
    expect(share.share_id).toMatch(/^shr_/);
    expect(share.scene).toBe(share.share_id);
    expect(share.path).toContain(`card=${share.public_id}`);
    expect(share.path).toContain(`share=${share.share_id}`);
  });

  it("updates the current employee card fields and privacy", async () => {
    const loginResponse = await app.inject({
      method: "POST",
      url: "/api/v1/auth/qy-login",
      payload: { code: "demo-qy-code" }
    });
    const login = JSON.parse(loginResponse.body) as { access_token: string };

    const updateResponse = await app.inject({
      method: "PUT",
      url: "/api/v1/employee/cards/current",
      headers: { authorization: `Bearer ${login.access_token}` },
      payload: {
        display_name: "Updated Demo Employee",
        title: "Account Director",
        fields: {
          email: "updated@example.com"
        },
        privacy: {
          show_mobile: true
        }
      }
    });

    expect(updateResponse.statusCode).toBe(200);
    const updated = JSON.parse(updateResponse.body) as {
      display_name: string;
      title: string;
      fields: { email: string; mobile: string };
      privacy: { show_mobile: boolean; show_email: boolean };
    };
    expect(updated.display_name).toBe("Updated Demo Employee");
    expect(updated.title).toBe("Account Director");
    expect(updated.fields.email).toBe("updated@example.com");
    expect(updated.fields.mobile).toBe("13800000000");
    expect(updated.privacy.show_mobile).toBe(true);
    expect(updated.privacy.show_email).toBe(true);
  });
});
