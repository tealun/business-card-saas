import { createCipheriv, createHash } from "node:crypto";
import { Test } from "@nestjs/testing";
import { FastifyAdapter, NestFastifyApplication } from "@nestjs/platform-fastify";
import { AppModule } from "../app.module.js";
import { registerXmlBodyParser } from "../common/xml-body-parser.js";
import { WecomSuiteStateRepository } from "./wecom-suite-state.repository.js";

const suite = {
  suiteId: "dev-wecom-suite-id",
  callbackToken: "dev-only-wecom-callback-token",
  callbackAesKey: "abcdefghijklmnopqrstuvwxyz0123456789ABCDEFG"
};

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
    const timestamp = "1700000100";
    const nonce = "nonce-verify";
    const encrypt = encryptFixture("verify-ok", suite.suiteId);
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
    const timestamp = "1700000200";
    const nonce = "nonce-ticket";
    const message =
      "<xml>" +
      `<SuiteId><![CDATA[${suite.suiteId}]]></SuiteId>` +
      "<InfoType><![CDATA[suite_ticket]]></InfoType>" +
      "<TimeStamp>1700000200</TimeStamp>" +
      "<SuiteTicket><![CDATA[ticket-002]]></SuiteTicket>" +
      "</xml>";
    const encrypt = encryptFixture(message, suite.suiteId);
    const msgSignature = signFixture(encrypt, timestamp, nonce);

    const response = await app.inject({
      method: "POST",
      url: `/api/v1/wecom/callbacks/command?msg_signature=${msgSignature}&timestamp=${timestamp}&nonce=${nonce}`,
      headers: { "content-type": "text/xml" },
      payload: `<xml><Encrypt><![CDATA[${encrypt}]]></Encrypt></xml>`
    });

    expect(response.statusCode).toBe(200);
    expect(response.body).toBe("success");

    const repository = app.get(WecomSuiteStateRepository);
    const stored = await repository.getSuiteTicket(suite.suiteId);
    expect(stored?.suiteTicket).toBe("ticket-002");
    expect(stored?.updatedAt.toISOString()).toBe("2023-11-14T22:16:40.000Z");
  });

  it("rejects command callbacks with invalid signatures", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/wecom/callbacks/command?msg_signature=bad&timestamp=1700000200&nonce=nonce-ticket",
      headers: { "content-type": "text/xml" },
      payload: "<xml><Encrypt><![CDATA[not-real]]></Encrypt></xml>"
    });

    expect(response.statusCode).toBe(401);
  });
});

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
