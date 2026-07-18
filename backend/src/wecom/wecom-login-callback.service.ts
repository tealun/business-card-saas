import { BadRequestException, Injectable, UnauthorizedException } from "@nestjs/common";
import { WecomCallbackCryptoService } from "./wecom-callback-crypto.service.js";
import { WecomConfigService } from "./wecom-config.service.js";
import type { WecomCallbackQuery, WecomCallbackQueryInput } from "./wecom-command-callback.service.js";

export interface WecomLoginCallbackResult {
  infoType: string;
  suiteId: string;
  handled: boolean;
}

@Injectable()
export class WecomLoginCallbackService {
  constructor(
    private readonly config: WecomConfigService,
    private readonly crypto: WecomCallbackCryptoService
  ) {}

  verifyUrl(query: WecomCallbackQueryInput, echoStr?: string): string {
    const normalizedQuery = normalizeQuery(query);
    if (!echoStr?.trim()) {
      throw new BadRequestException("missing WeCom echostr");
    }
    const decrypted = this.crypto.decrypt(
      {
        msgSignature: normalizedQuery.msgSignature,
        timestamp: normalizedQuery.timestamp,
        nonce: normalizedQuery.nonce,
        encrypt: echoStr
      },
      this.decryptOptions()
    );
    this.assertAllowedReceiveId(decrypted.receiveId);
    return decrypted.message;
  }

  receive(query: WecomCallbackQueryInput, body: unknown): WecomLoginCallbackResult {
    const normalizedQuery = normalizeQuery(query);
    const encryptedXml = bodyAsXml(body);
    const encrypt = readXmlText(encryptedXml, "Encrypt");
    if (!encrypt) {
      throw new BadRequestException("missing WeCom Encrypt field");
    }

    const decrypted = this.crypto.decrypt(
      {
        msgSignature: normalizedQuery.msgSignature,
        timestamp: normalizedQuery.timestamp,
        nonce: normalizedQuery.nonce,
        encrypt
      },
      this.decryptOptions()
    );
    this.assertAllowedReceiveId(decrypted.receiveId);
    const infoType = readXmlText(decrypted.message, "InfoType") ?? "unknown";
    const suiteId = readXmlText(decrypted.message, "SuiteId") ?? this.config.suite.suiteId;
    if (suiteId !== this.config.suite.suiteId) {
      throw new BadRequestException("WeCom login callback suite mismatch");
    }
    return { infoType, suiteId, handled: true };
  }

  private decryptOptions() {
    const suite = this.config.suite;
    return {
      token: suite.loginCallbackToken,
      aesKey: suite.loginCallbackAesKey,
      expectedReceiveId: null
    };
  }

  private assertAllowedReceiveId(receiveId: string): void {
    const suite = this.config.suite;
    if (receiveId !== suite.suiteId && receiveId !== suite.providerCorpId) {
      throw new UnauthorizedException("invalid WeCom login callback receiver");
    }
  }
}

function normalizeQuery(query: WecomCallbackQueryInput): WecomCallbackQuery {
  const msgSignature = query.msgSignature?.trim();
  const timestamp = query.timestamp?.trim();
  const nonce = query.nonce?.trim();
  if (!msgSignature || !timestamp || !nonce) {
    throw new BadRequestException("missing WeCom callback signature query");
  }
  return { msgSignature, timestamp, nonce };
}

function bodyAsXml(body: unknown): string {
  if (typeof body === "string") {
    return body;
  }
  if (Buffer.isBuffer(body)) {
    return body.toString("utf8");
  }
  throw new BadRequestException("WeCom callback body must be XML text");
}

function readXmlText(xml: string, tag: string): string | null {
  const match = xml.match(new RegExp(`<${tag}>\\s*(?:<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>|([\\s\\S]*?))\\s*</${tag}>`, "i"));
  const value = match?.[1] ?? match?.[2];
  return value?.trim() || null;
}
