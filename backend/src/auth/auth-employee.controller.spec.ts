import { Test } from "@nestjs/testing";
import { FastifyAdapter, NestFastifyApplication } from "@nestjs/platform-fastify";
import { AppModule } from "../app.module.js";
import { AuthRepository } from "./auth.repository.js";

function dataOf<T>(body: string): T {
  const envelope = JSON.parse(body) as { code: number; data: T; trace_id: string };
  expect(envelope.code).toBe(0);
  expect(envelope.trace_id).toBeTruthy();
  return envelope.data;
}

describe("Auth and employee card flow", () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    process.env.DEMO_AUTH_ENABLED = "1";
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

  it("does not resolve demo qy-login unless demo auth is explicitly enabled", () => {
    const original = process.env.DEMO_AUTH_ENABLED;
    delete process.env.DEMO_AUTH_ENABLED;
    const repository = new AuthRepository();

    expect(() => repository.resolveQyCode("demo-qy-code")).toThrow("WeCom qy-login is not configured");

    process.env.DEMO_AUTH_ENABLED = original;
  });

  it("rejects arbitrary qy-login codes even when demo auth is enabled", () => {
    const repository = new AuthRepository();

    expect(() => repository.resolveQyCode("not-real")).toThrow("invalid demo qy login code");
  });

  it("logs in with qy-login and reads the current employee card", async () => {
    const loginResponse = await app.inject({
      method: "POST",
      url: "/api/v1/auth/qy-login",
      payload: { code: "demo-qy-code" }
    });

    expect(loginResponse.statusCode).toBe(201);
    const login = dataOf<{
      access_token: string;
      current_identity: { public_id: string; open_userid: string };
    }>(loginResponse.body);
    expect(login.access_token).toBeTruthy();
    expect(login.current_identity.open_userid).toBe("ou_demo0001");
    expect(login.current_identity.public_id).toBe("pub_demo0001");

    const cardResponse = await app.inject({
      method: "GET",
      url: "/api/v1/employee/cards/current",
      headers: { authorization: `Bearer ${login.access_token}` }
    });

    expect(cardResponse.statusCode).toBe(200);
    const card = dataOf<{
      public_id: string;
      privacy: { show_mobile: boolean };
    }>(cardResponse.body);
    expect(card.public_id).toBe("pub_demo0001");
    expect(card.privacy.show_mobile).toBe(false);
  });

  it("creates an employee share id for the current card", async () => {
    const loginResponse = await app.inject({
      method: "POST",
      url: "/api/v1/auth/qy-login",
      payload: { code: "demo-qy-code" }
    });
    const login = dataOf<{ access_token: string }>(loginResponse.body);

    const shareResponse = await app.inject({
      method: "POST",
      url: "/api/v1/employee/cards/current/share",
      headers: { authorization: `Bearer ${login.access_token}` }
    });

    expect(shareResponse.statusCode).toBe(201);
    const share = dataOf<{
      public_id: string;
      share_id: string;
      scene: string;
      path: string;
    }>(shareResponse.body);
    expect(share.public_id).toBe("pub_demo0001");
    expect(share.share_id).toMatch(/^shr_/);
    expect(share.scene).toBe(share.share_id);
    expect(share.path).toContain("/pages/public/card");
    expect(share.path).toContain(`card=${share.public_id}`);
    expect(share.path).toContain(`share=${share.share_id}`);
  });

  it("serves visitor preview and applies allowed card style", async () => {
    const loginResponse = await app.inject({
      method: "POST",
      url: "/api/v1/auth/qy-login",
      payload: { code: "demo-qy-code" }
    });
    const login = dataOf<{ access_token: string }>(loginResponse.body);

    const styleResponse = await app.inject({
      method: "PUT",
      url: "/api/v1/employee/cards/current/style",
      headers: { authorization: `Bearer ${login.access_token}` },
      payload: {
        template_id: "tpl_demo_business",
        color_scheme: { primary: "#1677ff" },
        layout: { variant: "horizontal-business" }
      }
    });
    expect(styleResponse.statusCode).toBe(200);

    const previewResponse = await app.inject({
      method: "GET",
      url: "/api/v1/employee/cards/current/preview",
      headers: { authorization: `Bearer ${login.access_token}` }
    });
    expect(previewResponse.statusCode).toBe(200);
    const preview = dataOf<{
      card: { display_name: string; fields: { mobile: string | null; email: string | null } };
      template: { template_id: string };
      company_profile: { name: string };
    }>(previewResponse.body);
    expect(preview.card.display_name).toBeTruthy();
    expect(preview.card.fields.mobile).toBeNull();
    expect(preview.card.fields.email).toBeTruthy();
    expect(preview.template.template_id).toBe("tpl_demo_business");
    expect(preview.company_profile.name).toBeTruthy();
  });

  it("updates the current employee card fields and privacy", async () => {
    const loginResponse = await app.inject({
      method: "POST",
      url: "/api/v1/auth/qy-login",
      payload: { code: "demo-qy-code" }
    });
    const login = dataOf<{ access_token: string }>(loginResponse.body);

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
    const updated = dataOf<{
      display_name: string;
      title: string;
      fields: { email: string; mobile: string };
      privacy: { show_mobile: boolean; show_email: boolean };
    }>(updateResponse.body);
    expect(updated.display_name).toBe("Updated Demo Employee");
    expect(updated.title).toBe("Account Director");
    expect(updated.fields.email).toBe("updated@example.com");
    expect(updated.fields.mobile).toBe("13800000000");
    expect(updated.privacy.show_mobile).toBe(true);
    expect(updated.privacy.show_email).toBe(true);
  });
});
