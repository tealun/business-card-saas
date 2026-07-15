import { createCipheriv, createHash } from "node:crypto";
import { Test } from "@nestjs/testing";
import { FastifyAdapter, NestFastifyApplication } from "@nestjs/platform-fastify";
import { AppModule } from "../app.module.js";
import { registerXmlBodyParser } from "../common/xml-body-parser.js";
import { WecomSuiteStateRepository } from "./wecom-suite-state.repository.js";

const suite = {
  providerCorpId: process.env.WECOM_PROVIDER_CORP_ID ?? "wwprovider0001",
  suiteId: process.env.WECOM_SUITE_ID ?? "dev-wecom-suite-id",
  callbackToken: process.env.WECOM_CALLBACK_TOKEN ?? "dev-only-wecom-callback-token",
  callbackAesKey: process.env.WECOM_CALLBACK_AES_KEY ?? "abcdefghijklmnopqrstuvwxyz0123456789ABCDEFG"
};

let nonceCounter = 0;

function freshTimestamp(): number {
  return Math.floor(Date.now() / 1000);
}

function freshNonce(): string {
  nonceCounter += 1;
  return `nonce-${nonceCounter}`;
}

describe("WecomCommandCallbackController", () => {
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

  it("returns the decrypted echo string for WeCom URL verification", async () => {
    const timestamp = String(freshTimestamp());
    const nonce = freshNonce();
    // The mini-program association flow can encrypt URL verification with a
    // platform/provider receiver id that differs from the application's SuiteID.
    const encrypt = encryptFixture("verify-ok", suite.providerCorpId);
    const msgSignature = signFixture(encrypt, timestamp, nonce);

    const response = await app.inject({
      method: "GET",
      url:
        `/api/v1/wecom/callbacks/command?msg_signature=${msgSignature}` +
        `&timestamp=${timestamp}&nonce=${nonce}&echostr=${encodeURIComponent(encrypt)}`
    });

    expect(response.statusCode).toBe(200);
    expect(response.body).toBe("verify-ok");
  });

  it("stores suite_ticket callbacks and returns raw success text", async () => {
    const response = await postSuiteTicket(app, "ticket-002", freshTimestamp(), freshNonce());

    expect(response.statusCode).toBe(200);
    expect(response.body).toBe("success");

    const repository = app.get(WecomSuiteStateRepository);
    const stored = await repository.getSuiteTicket(suite.suiteId);
    expect(stored?.suiteTicket).toBe("ticket-002");
  });

  it("keeps the newer suite_ticket when an older retry arrives later", async () => {
    const now = freshTimestamp();
    await postSuiteTicket(app, "ticket-new", now + 2, freshNonce());
    await postSuiteTicket(app, "ticket-old", now + 1, freshNonce());

    const repository = app.get(WecomSuiteStateRepository);
    const stored = await repository.getSuiteTicket(suite.suiteId);
    expect(stored?.suiteTicket).toBe("ticket-new");
  });

  it("rejects command callbacks missing signature query fields", async () => {
    const response = await app.inject({
      method: "POST",
      url: `/api/v1/wecom/callbacks/command?timestamp=${freshTimestamp()}&nonce=${freshNonce()}`,
      headers: { "content-type": "text/xml" },
      payload: "<xml />"
    });

    expect(response.statusCode).toBe(400);
  });

  it("rejects command callbacks with invalid signatures", async () => {
    const response = await app.inject({
      method: "POST",
      url: `/api/v1/wecom/callbacks/command?msg_signature=bad&timestamp=${freshTimestamp()}&nonce=${freshNonce()}`,
      headers: { "content-type": "text/xml" },
      payload: "<xml><Encrypt><![CDATA[not-real]]></Encrypt></xml>"
    });

    expect(response.statusCode).toBe(401);
  });
});

async function postSuiteTicket(
  app: NestFastifyApplication,
  suiteTicket: string,
  eventTimestamp: number,
  nonce: string
) {
  const timestamp = String(eventTimestamp);
  const message =
    "<xml>" +
    `<SuiteId><![CDATA[${suite.suiteId}]]></SuiteId>` +
    "<InfoType><![CDATA[suite_ticket]]></InfoType>" +
    `<TimeStamp>${eventTimestamp}</TimeStamp>` +
    `<SuiteTicket><![CDATA[${suiteTicket}]]></SuiteTicket>` +
    "</xml>";
  const encrypt = encryptFixture(message, suite.suiteId);
  const msgSignature = signFixture(encrypt, timestamp, nonce);

  return app.inject({
    method: "POST",
    url: `/api/v1/wecom/callbacks/command?msg_signature=${msgSignature}&timestamp=${timestamp}&nonce=${nonce}`,
    headers: { "content-type": "text/xml" },
    payload: `<xml><Encrypt><![CDATA[${encrypt}]]></Encrypt></xml>`
  });
}

function signFixture(encrypt: string, timestamp: string, nonce: string): string {
  return createHash("sha1")
    .update([suite.callbackToken, timestamp, nonce, encrypt].sort().join(""))
    .digest("hex");
}

function encryptFixture(message: string, receiveId: string): string {
  const aesKey = Buffer.from(`${suite.callbackAesKey}=`, "base64");
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
