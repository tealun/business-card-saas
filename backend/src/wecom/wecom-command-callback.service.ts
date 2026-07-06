import { BadRequestException, Injectable } from "@nestjs/common";
import { WecomAuthorizationService } from "./wecom-authorization.service.js";
import { WecomCallbackCryptoService } from "./wecom-callback-crypto.service.js";
import { WecomSuiteStateRepository } from "./wecom-suite-state.repository.js";

export interface WecomCallbackQuery {
  msgSignature: string;
  timestamp: string;
  nonce: string;
}

export interface WecomCallbackQueryInput {
  msgSignature: string | undefined;
  timestamp: string | undefined;
  nonce: string | undefined;
}

export interface WecomCommandCallbackResult {
  infoType: string;
  suiteId: string;
  handled: boolean;
}

@Injectable()
export class WecomCommandCallbackService {
  constructor(
    private readonly crypto: WecomCallbackCryptoService,
    private readonly suiteState: WecomSuiteStateRepository,
    private readonly authorization: WecomAuthorizationService
  ) {}

  verifyUrl(query: WecomCallbackQueryInput, echoStr?: string): string {
    const normalizedQuery = normalizeQuery(query);
    if (!echoStr?.trim()) {
      throw new BadRequestException("missing WeCom echostr");
    }
    return this.crypto.decrypt({
      msgSignature: normalizedQuery.msgSignature,
      timestamp: normalizedQuery.timestamp,
      nonce: normalizedQuery.nonce,
      encrypt: echoStr
    }).message;
  }

  async receive(query: WecomCallbackQueryInput, body: unknown): Promise<WecomCommandCallbackResult> {
    const normalizedQuery = normalizeQuery(query);
    const encryptedXml = bodyAsXml(body);
    const encrypt = readXmlText(encryptedXml, "Encrypt");
    if (!encrypt) {
      throw new BadRequestException("missing WeCom Encrypt field");
    }

    const decrypted = this.crypto.decrypt({
      msgSignature: normalizedQuery.msgSignature,
      timestamp: normalizedQuery.timestamp,
      nonce: normalizedQuery.nonce,
      encrypt
    });
    return this.handleCommandMessage(decrypted.message, decrypted.receiveId);
  }

  private async handleCommandMessage(messageXml: string, receiveId: string): Promise<WecomCommandCallbackResult> {
    const infoType = readXmlText(messageXml, "InfoType");
    const suiteId = readXmlText(messageXml, "SuiteId") ?? receiveId;
    if (!infoType) {
      throw new BadRequestException("missing WeCom InfoType");
    }
    if (suiteId !== receiveId) {
      throw new BadRequestException("WeCom SuiteId does not match callback receiver");
    }

    if (infoType === "suite_ticket") {
      const suiteTicket = readXmlText(messageXml, "SuiteTicket");
      if (!suiteTicket) {
        throw new BadRequestException("missing WeCom SuiteTicket");
      }
      await this.suiteState.saveSuiteTicket(suiteId, suiteTicket, eventTime(messageXml));
      return { infoType, suiteId, handled: true };
    }
    if (infoType === "create_auth" || infoType === "change_auth") {
      const authCode = readXmlText(messageXml, "AuthCode");
      if (!authCode) {
        throw new BadRequestException("missing WeCom AuthCode");
      }
      await this.authorization.handleAuthCode(authCode, eventTime(messageXml));
      return { infoType, suiteId, handled: true };
    }

    return { infoType, suiteId, handled: false };
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

function eventTime(messageXml: string): Date {
  const timestamp = Number(readXmlText(messageXml, "TimeStamp"));
  if (!Number.isFinite(timestamp) || timestamp <= 0) {
    return new Date();
  }
  return new Date(timestamp * 1000);
}
