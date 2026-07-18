import { createCipheriv, createHash } from "node:crypto";
import { Test } from "@nestjs/testing";
import { FastifyAdapter, NestFastifyApplication } from "@nestjs/platform-fastify";
import { AppModule } from "../app.module.js";
import { registerXmlBodyParser } from "../common/xml-body-parser.js";

const suite = {
  providerCorpId: process.env.WECOM_PROVIDER_CORP_ID ?? "wwtestproviderid",
  suiteId: process.env.WECOM_SUITE_ID ?? "wwtestsuiteid",
  commandCallbackToken: process.env.WECOM_CALLBACK_TOKEN ?? "test-callback-token",
  loginCallbackToken: process.env.WECOM_LOGIN_CALLBACK_TOKEN ?? "test-login-callback-token",
  loginCallbackAesKey: process.env.WECOM_LOGIN_CALLBACK_AES_KEY ?? "abcdefghijklmnopqrstuvwxyz0123456789ABCDEFG"
};

let nonceCounter = 0;

function freshTimestamp(): number {
  return Math.floor(Date.now() / 1000);
}

function freshNonce(): string {
  nonceCounter += 1;
  return `login-nonce-${nonceCounter}`;
}

describe("WecomLoginCallbackController", () => {
  const originalDatabaseUrl = process.env.DATABASE_URL;
  let app: NestFastifyApplication;

  beforeAll(async () => {
    delete process.env.DATABASE_URL;
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule]
    }).compile();

    const adapter = new FastifyAdapter();
    registerXmlBodyParser(adapter);
    app = moduleRef.createNestApplication<NestFastifyApplication>(adapter);
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

  it("returns the decrypted echo string for login authorization URL verification", async () => {
    const timestamp = String(freshTimestamp());
    const nonce = freshNonce();
    const encrypt = encryptFixture("login-verify-ok", suite.suiteId);
    const msgSignature = signFixture(encrypt, timestamp, nonce, suite.loginCallbackToken);

    const response = await app.inject({
      method: "GET",
      url:
        `/api/v1/wecom/callbacks/login?msg_signature=${msgSignature}` +
        `&timestamp=${timestamp}&nonce=${nonce}&echostr=${encodeURIComponent(encrypt)}`
    });

    expect(response.statusCode).toBe(200);
    expect(response.body).toBe("login-verify-ok");
  });

  it("rejects login authorization verification signed with the command callback token", async () => {
    const timestamp = String(freshTimestamp());
    const nonce = freshNonce();
    const encrypt = encryptFixture("login-verify-ok", suite.suiteId);
    const msgSignature = signFixture(encrypt, timestamp, nonce, suite.commandCallbackToken);

    const response = await app.inject({
      method: "GET",
      url:
        `/api/v1/wecom/callbacks/login?msg_signature=${msgSignature}` +
        `&timestamp=${timestamp}&nonce=${nonce}&echostr=${encodeURIComponent(encrypt)}`
    });

    expect(response.statusCode).toBe(401);
  });

  it("also accepts URL verification encrypted for the provider corp receiver", async () => {
    const timestamp = String(freshTimestamp());
    const nonce = freshNonce();
    const encrypt = encryptFixture("login-provider-verify-ok", suite.providerCorpId);
    const msgSignature = signFixture(encrypt, timestamp, nonce, suite.loginCallbackToken);

    const response = await app.inject({
      method: "GET",
      url:
        `/api/v1/wecom/callbacks/login?msg_signature=${msgSignature}` +
        `&timestamp=${timestamp}&nonce=${nonce}&echostr=${encodeURIComponent(encrypt)}`
    });

    expect(response.statusCode).toBe(200);
    expect(response.body).toBe("login-provider-verify-ok");
  });

  it("rejects login authorization verification encrypted for an unexpected receiver", async () => {
    const timestamp = String(freshTimestamp());
    const nonce = freshNonce();
    const encrypt = encryptFixture("login-verify-ok", "wwunexpectedreceiver");
    const msgSignature = signFixture(encrypt, timestamp, nonce, suite.loginCallbackToken);

    const response = await app.inject({
      method: "GET",
      url:
        `/api/v1/wecom/callbacks/login?msg_signature=${msgSignature}` +
        `&timestamp=${timestamp}&nonce=${nonce}&echostr=${encodeURIComponent(encrypt)}`
    });

    expect(response.statusCode).toBe(401);
  });

  it("acknowledges encrypted login authorization callback messages", async () => {
    const timestamp = String(freshTimestamp());
    const nonce = freshNonce();
    const message =
      "<xml>" +
      `<SuiteId><![CDATA[${suite.suiteId}]]></SuiteId>` +
      "<InfoType><![CDATA[login_auth]]></InfoType>" +
      `<TimeStamp>${timestamp}</TimeStamp>` +
      "</xml>";
    const encrypt = encryptFixture(message, suite.suiteId);
    const msgSignature = signFixture(encrypt, timestamp, nonce, suite.loginCallbackToken);

    const response = await app.inject({
      method: "POST",
      url: `/api/v1/wecom/callbacks/login?msg_signature=${msgSignature}&timestamp=${timestamp}&nonce=${nonce}`,
      headers: { "content-type": "text/xml" },
      payload: `<xml><Encrypt><![CDATA[${encrypt}]]></Encrypt></xml>`
    });

    expect(response.statusCode).toBe(200);
    expect(response.body).toBe("success");
  });
});

function signFixture(encrypt: string, timestamp: string, nonce: string, token: string): string {
  return createHash("sha1")
    .update([token, timestamp, nonce, encrypt].sort().join(""))
    .digest("hex");
}

function encryptFixture(message: string, receiveId: string): string {
  const aesKey = Buffer.from(`${suite.loginCallbackAesKey}=`, "base64");
  const random = Buffer.from("0123456789abcdef", "utf8");
  const messageBuffer = Buffer.from(message, "utf8");
  const lengthBuffer = Buffer.alloc(4);
  lengthBuffer.writeUInt32BE(messageBuffer.length, 0);
  const plain = appendPkcs7Padding(Buffer.concat([random, lengthBuffer, messageBuffer, Buffer.from(receiveId, "utf8")]));
  const cipher = createCipheriv("aes-256-cbc", aesKey, aesKey.subarray(0, 16));
  cipher.setAutoPadding(false);
  return Buffer.concat([cipher.update(plain), cipher.final()]).toString("base64");
}

function appendPkcs7Padding(buffer: Buffer): Buffer {
  const blockSize = 32;
  const remainder = buffer.length % blockSize;
  const padding = remainder === 0 ? blockSize : blockSize - remainder;
  return Buffer.concat([buffer, Buffer.alloc(padding, padding)]);
}
