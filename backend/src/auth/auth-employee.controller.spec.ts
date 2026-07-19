import { Test } from "@nestjs/testing";
import { FastifyAdapter, NestFastifyApplication } from "@nestjs/platform-fastify";
import { AppModule } from "../app.module.js";
import { defaultEmployeePublicId } from "../common/default-public-id.js";
import { SessionTokenService } from "../session/session-token.service.js";
import { AuthRepository } from "./auth.repository.js";
import {
  WecomMiniProgramLoginService,
  type WecomMiniProgramIdentity
} from "../wecom/wecom-miniprogram-login.service.js";

function dataOf<T>(body: string): T {
  const envelope = JSON.parse(body) as { code: number; data: T; trace_id: string };
  expect(envelope.code).toBe(0);
  expect(envelope.trace_id).toBeTruthy();
  return envelope.data;
}

function demoIdentity(): WecomMiniProgramIdentity {
  return {
    accountId: "1",
    tenantId: "1",
    tenantName: "Demo Tenant",
    memberIdentityId: "1",
    displayName: "M1 Demo Employee",
    openCorpid: "corp_demo0001",
    openUserid: "ou_demo0001",
    publicId: "pub_demo0001",
    sessionKey: "demo-session-key"
  };
}

const demoWecomMiniProgramLoginService = {
  async resolveJsCode(): Promise<WecomMiniProgramIdentity> {
    return demoIdentity();
  }
} as unknown as WecomMiniProgramLoginService;

describe("Auth and employee card flow", () => {
  let app: NestFastifyApplication;
  const originalDatabaseUrl = process.env.DATABASE_URL;

  beforeAll(async () => {
    delete process.env.DATABASE_URL;
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule]
    })
      .overrideProvider(WecomMiniProgramLoginService)
      .useValue(demoWecomMiniProgramLoginService)
      .compile();

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

  it("rejects employee current card without a bearer token", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/employee/cards/current"
    });

    expect(response.statusCode).toBe(401);
  });

  it("rejects empty qy-login codes", async () => {
    const repository = new AuthRepository(demoWecomMiniProgramLoginService);

    await expect(repository.resolveQyCode("   ")).rejects.toThrow("invalid qy login code");
  });

  it("resolves real qy-login through the WeCom adapter when available", async () => {
    const adapter = {
      resolveJsCode: jest.fn(async (code: string): Promise<WecomMiniProgramIdentity> => ({
        accountId: "acct-001",
        tenantId: "tenant-001",
        tenantName: "Pilot Corp",
        memberIdentityId: "member-001",
        displayName: "ou-001",
        openCorpid: "corp-001",
        openUserid: "ou-001",
        publicId: "pub_real0001",
        sessionKey: "session-key"
      }))
    };
    const repository = new AuthRepository(adapter as unknown as WecomMiniProgramLoginService);

    const identity = await repository.resolveQyCode("real-code");

    expect(adapter.resolveJsCode).toHaveBeenCalledWith("real-code");
    expect(repository.toSession(identity)).toEqual({
      accountId: "acct-001",
      identityType: "wecom_member",
      tenantId: "tenant-001",
      tenantName: "Pilot Corp",
      memberIdentityId: "member-001",
      displayName: "ou-001",
      openUserid: "ou-001",
      publicId: "pub_real0001"
    });
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
      current_identity: { identity_type: string; public_id: string; open_userid: string };
    }>(loginResponse.body);
    expect(login.access_token).toBeTruthy();
    expect(login.current_identity.identity_type).toBe("wecom_member");
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

  it("accepts qy-login with an optional wx_code for account linking", async () => {
    const loginResponse = await app.inject({
      method: "POST",
      url: "/api/v1/auth/qy-login",
      payload: { code: "demo-qy-code", wx_code: "demo-wx-code" }
    });

    expect(loginResponse.statusCode).toBe(201);
    const login = dataOf<{
      access_token: string;
      current_identity: { identity_type: string; open_userid: string };
    }>(loginResponse.body);
    expect(login.access_token).toBeTruthy();
    expect(login.current_identity.identity_type).toBe("wecom_member");
    expect(login.current_identity.open_userid).toBe("ou_demo0001");
  });

  it("logs in from WeChat and creates a personal card identity", async () => {
    const loginResponse = await app.inject({
      method: "POST",
      url: "/api/v1/auth/wx-login",
      payload: { code: "demo-wx-code" }
    });

    expect(loginResponse.statusCode).toBe(201);
    const login = dataOf<{
      access_token: string;
      current_identity: {
        identity_type: "personal";
        tenant_name: string;
        member_identity_id: string;
        public_id: string;
      };
      identities: Array<{ identity_type: string; member_identity_id: string }>;
    }>(loginResponse.body);
    expect(login.access_token).toBeTruthy();
    expect(login.current_identity.identity_type).toBe("personal");
    expect(login.current_identity.tenant_name).toBe("个人名片");
    expect(login.identities.some((identity) => identity.identity_type === "personal")).toBe(true);

    const cardResponse = await app.inject({
      method: "GET",
      url: "/api/v1/employee/cards/current",
      headers: { authorization: `Bearer ${login.access_token}` }
    });
    expect(cardResponse.statusCode).toBe(200);
    const card = dataOf<{ public_id: string; company: string | null; display_name: string }>(cardResponse.body);
    expect(card.public_id).toBe(login.current_identity.public_id);
    expect(card.company).toBeNull();
    expect(card.display_name).toBe("我的名片");
  });

  it("rejects switching to an identity owned by another account", async () => {
    const loginResponse = await app.inject({
      method: "POST",
      url: "/api/v1/auth/wx-login",
      payload: { code: "demo-wx-code" }
    });
    const login = dataOf<{ access_token: string }>(loginResponse.body);

    const switchResponse = await app.inject({
      method: "POST",
      url: "/api/v1/auth/switch-identity",
      headers: { authorization: `Bearer ${login.access_token}` },
      payload: { member_identity_id: "not-owned-by-this-account" }
    });

    expect(switchResponse.statusCode).toBe(403);
  });

  it("initializes and publishes a default card for a real employee session", async () => {
    const sessionTokens = app.get(SessionTokenService);
    const publicId = defaultEmployeePublicId({ tenantId: "tenant-101", memberIdentityId: "member-101" });
    const accessToken = sessionTokens.sign({
      accountId: "acct-101",
      tenantId: "tenant-101",
      tenantName: "Pilot Corp",
      memberIdentityId: "member-101",
      displayName: "ou-real-101",
      openUserid: "ou-real-101",
      publicId
    });

    const cardResponse = await app.inject({
      method: "GET",
      url: "/api/v1/employee/cards/current",
      headers: { authorization: `Bearer ${accessToken}` }
    });
    expect(cardResponse.statusCode).toBe(200);
    const card = dataOf<{
      public_id: string;
      display_name: string;
      company: string;
      privacy: { show_mobile: boolean };
    }>(cardResponse.body);
    expect(card.public_id).toBe(publicId);
    expect(card.display_name).toBe("ou-real-101");
    expect(card.company).toBe("Pilot Corp");
    expect(card.privacy.show_mobile).toBe(false);

    const shareResponse = await app.inject({
      method: "POST",
      url: "/api/v1/employee/cards/current/share",
      headers: { authorization: `Bearer ${accessToken}` }
    });
    expect(shareResponse.statusCode).toBe(201);

    const publicResponse = await app.inject({
      method: "GET",
      url: `/api/v1/public/cards/${publicId}`
    });
    expect(publicResponse.statusCode).toBe(200);
    const publicCard = dataOf<{
      public_id: string;
      card: { display_name: string; company: string };
    }>(publicResponse.body);
    expect(publicCard.public_id).toBe(publicId);
    expect(publicCard.card.display_name).toBe("ou-real-101");
    expect(publicCard.card.company).toBe("Pilot Corp");
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
      fields: { email: string; mobile: string | null };
      privacy: { show_mobile: boolean; show_email: boolean };
    }>(updateResponse.body);
    expect(updated.display_name).toBe("Updated Demo Employee");
    expect(updated.title).toBe("Account Director");
    expect(updated.fields.email).toBe("updated@example.com");
    expect(updated.fields.mobile).toBeNull();
    expect(updated.privacy.show_mobile).toBe(true);
    expect(updated.privacy.show_email).toBe(true);
  });
});
