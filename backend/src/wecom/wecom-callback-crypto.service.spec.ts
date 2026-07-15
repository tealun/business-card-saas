import { createCipheriv, createHash } from "node:crypto";
import { UnauthorizedException } from "@nestjs/common";
import { WecomCallbackCryptoService } from "./wecom-callback-crypto.service.js";
import { WecomConfigService, type WecomSuiteConfig } from "./wecom-config.service.js";

const suite: WecomSuiteConfig = {
  suiteId: "wwsuite0001",
  suiteSecret: "suite-secret",
  callbackToken: "callback-token",
  callbackAesKey: "abcdefghijklmnopqrstuvwxyz0123456789ABCDEFG",
  dataCallbackToken: "data-callback-token",
  dataCallbackAesKey: "abcdefghijklmnopqrstuvwxyz0123456789ABCDEFG"
};

let nonceCounter = 0;

function freshTimestamp(): string {
  return String(Math.floor(Date.now() / 1000));
}

function freshNonce(): string {
  nonceCounter += 1;
  return `nonce-${nonceCounter}`;
}

describe("WecomCallbackCryptoService", () => {
  const service = new WecomCallbackCryptoService(stubConfig(suite));

  it("decrypts a signed WeCom callback message", () => {
    const message = "<xml><SuiteTicket><![CDATA[ticket-001]]></SuiteTicket></xml>";
    const encrypt = encryptFixture(message, suite.suiteId);
    const timestamp = freshTimestamp();
    const nonce = freshNonce();
    const msgSignature = signFixture(encrypt, timestamp, nonce);

    const decrypted = service.decrypt({ msgSignature, timestamp, nonce, encrypt });

    expect(decrypted).toEqual({ message, receiveId: suite.suiteId });
  });

  it("rejects callbacks with an invalid signature", () => {
    const encrypt = encryptFixture("<xml />", suite.suiteId);

    expect(() =>
      service.decrypt({
        msgSignature: "bad-signature",
        timestamp: freshTimestamp(),
        nonce: freshNonce(),
        encrypt
      })
    ).toThrow(UnauthorizedException);
  });

  it("rejects callbacks encrypted for a different receiver", () => {
    const encrypt = encryptFixture("<xml />", "wrong-suite");
    const timestamp = freshTimestamp();
    const nonce = freshNonce();

    expect(() =>
      service.decrypt({
        msgSignature: signFixture(encrypt, timestamp, nonce),
        timestamp,
        nonce,
        encrypt
      })
    ).toThrow("invalid WeCom callback receiver");
  });

  it("can decrypt data callbacks before receiver ownership is checked", () => {
    const message = "<xml><Event><![CDATA[change_contact]]></Event></xml>";
    const encrypt = encryptFixture(message, "corp-001");
    const timestamp = freshTimestamp();
    const nonce = freshNonce();

    const decrypted = service.decrypt(
      {
        msgSignature: signFixture(encrypt, timestamp, nonce),
        timestamp,
        nonce,
        encrypt
      },
      { expectedReceiveId: null }
    );

    expect(decrypted).toEqual({ message, receiveId: "corp-001" });
  });

  it("decrypts already verified ciphertext for retry workers", () => {
    const message = "<xml><Event><![CDATA[change_contact]]></Event></xml>";
    const encrypt = encryptFixture(message, "corp-001");

    const decrypted = service.decryptTrustedCiphertext(encrypt, {
      aesKey: suite.dataCallbackAesKey,
      expectedReceiveId: null
    });

    expect(decrypted).toEqual({ message, receiveId: "corp-001" });
  });

  it("rejects callbacks with malformed PKCS7 padding bytes", () => {
    const encrypt = encryptFixture("<xml />", suite.suiteId, { corruptPadding: true });
    const timestamp = freshTimestamp();
    const nonce = freshNonce();

    expect(() =>
      service.decrypt({
        msgSignature: signFixture(encrypt, timestamp, nonce),
        timestamp,
        nonce,
        encrypt
      })
    ).toThrow("invalid WeCom callback padding");
  });

  it("rejects callbacks outside the allowed timestamp window", () => {
    const message = "<xml><SuiteTicket><![CDATA[ticket-001]]></SuiteTicket></xml>";
    const encrypt = encryptFixture(message, suite.suiteId);
    const timestamp = String(Math.floor(Date.now() / 1000) - 10 * 60);
    const nonce = freshNonce();

    expect(() =>
      service.decrypt({
        msgSignature: signFixture(encrypt, timestamp, nonce),
        timestamp,
        nonce,
        encrypt
      })
    ).toThrow("WeCom callback timestamp is outside the allowed window");
  });

  it("rejects callbacks with a replayed nonce", () => {
    const message = "<xml><SuiteTicket><![CDATA[ticket-replay]]></SuiteTicket></xml>";
    const encrypt = encryptFixture(message, suite.suiteId);
    const timestamp = freshTimestamp();
    const nonce = freshNonce();
    const msgSignature = signFixture(encrypt, timestamp, nonce);
    const payload = { msgSignature, timestamp, nonce, encrypt };

    service.decrypt(payload);

    expect(() => service.decrypt(payload)).toThrow("WeCom callback nonce has already been processed");
  });

  it("accepts distinct command and data validations that share timestamp and nonce", () => {
    const timestamp = freshTimestamp();
    const nonce = freshNonce();
    const dataMessage = "<xml><Event><![CDATA[change_contact]]></Event></xml>";
    const commandMessage = "<xml><InfoType><![CDATA[suite_ticket]]></InfoType></xml>";
    const dataEncrypt = encryptFixture(dataMessage, "corp-001");
    const commandEncrypt = encryptFixture(commandMessage, suite.suiteId);

    const dataResult = service.decrypt(
      {
        msgSignature: signFixture(dataEncrypt, timestamp, nonce),
        timestamp,
        nonce,
        encrypt: dataEncrypt
      },
      { expectedReceiveId: null }
    );
    const commandResult = service.decrypt({
      msgSignature: signFixture(commandEncrypt, timestamp, nonce),
      timestamp,
      nonce,
      encrypt: commandEncrypt
    });

    expect(dataResult).toEqual({ message: dataMessage, receiveId: "corp-001" });
    expect(commandResult).toEqual({ message: commandMessage, receiveId: suite.suiteId });
  });
});

function stubConfig(config: WecomSuiteConfig): WecomConfigService {
  return {
    get suite() {
      return config;
    }
  } as WecomConfigService;
}

function signFixture(encrypt: string, timestamp: string, nonce: string): string {
  return createHash("sha1")
    .update([suite.callbackToken, timestamp, nonce, encrypt].sort().join(""))
    .digest("hex");
}

function encryptFixture(message: string, receiveId: string, options: { corruptPadding?: boolean } = {}): string {
  const aesKey = Buffer.from(`${suite.callbackAesKey}=`, "base64");
  const random = Buffer.from("0123456789abcdef", "utf8");
  const messageBuffer = Buffer.from(message, "utf8");
  const lengthBuffer = Buffer.alloc(4);
  lengthBuffer.writeUInt32BE(messageBuffer.length, 0);

  const plain = appendPkcs7Padding(Buffer.concat([random, lengthBuffer, messageBuffer, Buffer.from(receiveId, "utf8")]));
  if (options.corruptPadding) {
    plain.writeUInt8(1, plain.length - 2);
  }
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
