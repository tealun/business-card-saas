import { createHash } from "node:crypto";
import { BadRequestException, Injectable } from "@nestjs/common";
import { WecomCallbackEventRepository } from "./wecom-callback-event.repository.js";
import { WecomCallbackAlertService } from "./wecom-callback-alert.service.js";
import { WecomCallbackCryptoService } from "./wecom-callback-crypto.service.js";
import { WecomConfigService } from "./wecom-config.service.js";
import { WecomContactSyncRepository } from "./wecom-contact-sync.repository.js";
import { WecomTenantAuthRepository } from "./wecom-tenant-auth.repository.js";
import type { WecomCallbackQuery, WecomCallbackQueryInput } from "./wecom-command-callback.service.js";

export interface WecomDataCallbackResult {
  event: string;
  changeType: string | null;
  tenantId: string;
  handled: boolean;
}

export interface WecomDataCallbackRetryResult {
  retriedCount: number;
  succeededCount: number;
  failedCount: number;
  deadCount: number;
}

const MAX_CALLBACK_RETRIES = 5;

@Injectable()
export class WecomDataCallbackService {
  constructor(
    private readonly config: WecomConfigService,
    private readonly crypto: WecomCallbackCryptoService,
    private readonly events: WecomCallbackEventRepository,
    private readonly tenants: WecomTenantAuthRepository,
    private readonly contacts: WecomContactSyncRepository,
    private readonly alerts: WecomCallbackAlertService
  ) {}

  verifyUrl(query: WecomCallbackQueryInput, echoStr?: string): string {
    const normalizedQuery = normalizeQuery(query);
    if (!echoStr?.trim()) {
      throw new BadRequestException("missing WeCom echostr");
    }
    return this.crypto.decrypt(
      {
        msgSignature: normalizedQuery.msgSignature,
        timestamp: normalizedQuery.timestamp,
        nonce: normalizedQuery.nonce,
        encrypt: echoStr
      },
      this.decryptOptions()
    ).message;
  }

  async receive(query: WecomCallbackQueryInput, body: unknown): Promise<WecomDataCallbackResult> {
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
    return this.handleDataMessage(decrypted.message, decrypted.receiveId, encrypt);
  }

  async retryFailedEvents(input: { tenantId?: string; limit?: number } = {}): Promise<WecomDataCallbackRetryResult> {
    const candidates = await this.events.listRetryableDataEvents(
      MAX_CALLBACK_RETRIES,
      input.limit ?? 20,
      input.tenantId ?? null
    );
    const result: WecomDataCallbackRetryResult = {
      retriedCount: 0,
      succeededCount: 0,
      failedCount: 0,
      deadCount: 0
    };

    for (const event of candidates) {
      result.retriedCount += 1;
      let decryptedMessage: string | undefined;
      let decryptedReceiveId: string | undefined;

      try {
        const decrypted = this.crypto.decryptTrustedCiphertext(event.payloadEncrypted, this.decryptOptions());
        decryptedMessage = decrypted.message;
        decryptedReceiveId = decrypted.receiveId;
      } catch (error) {
        // Pre-processing decrypt failures are the only errors we own here.
        // handleDataMessage owns its own failure bookkeeping.
        result.failedCount += 1;
        result.deadCount += 1;
        await this.events.markFailed(event.eventKey, error, event.tenantId, { deadLetter: true });
        await this.alerts.notifyDeadLetter({
          source: "data",
          eventKey: event.eventKey,
          tenantId: event.tenantId,
          eventType: event.eventType,
          changeType: event.changeType,
          retryCount: event.retryCount + 1,
          errorType: errorType(error)
        });
        continue;
      }

      try {
        await this.handleDataMessage(decryptedMessage, decryptedReceiveId, event.payloadEncrypted);
        result.succeededCount += 1;
      } catch (error) {
        // handleDataMessage already marks failed/dead-letter and alerts.
        result.failedCount += 1;
        if (event.retryCount + 1 >= MAX_CALLBACK_RETRIES) {
          result.deadCount += 1;
        }
      }
    }

    return result;
  }

  private async handleDataMessage(
    messageXml: string,
    receiveId: string,
    payloadEncrypted: string
  ): Promise<WecomDataCallbackResult> {
    const event = readXmlText(messageXml, "InfoType") ?? readXmlText(messageXml, "Event");
    const changeType = readXmlText(messageXml, "ChangeType");
    if (event !== "change_contact") {
      return { event: event ?? "unknown", changeType, tenantId: "", handled: false };
    }

    const suiteId = readXmlText(messageXml, "SuiteId");
    const messageCorpid = readXmlText(messageXml, "AuthCorpId") ?? readXmlText(messageXml, "ToUserName") ?? readXmlText(messageXml, "CorpId");
    if (suiteId && suiteId !== receiveId) {
      throw new BadRequestException("WeCom data callback receiver mismatch");
    }
    if (!suiteId && messageCorpid && messageCorpid !== receiveId) {
      throw new BadRequestException("WeCom data callback receiver mismatch");
    }
    const openCorpid = messageCorpid ?? (!suiteId ? receiveId : null);
    if (!openCorpid) {
      throw new BadRequestException("missing WeCom data callback corp id");
    }
    const tenant = await this.tenants.getByOpenCorpid(openCorpid);
    if (!tenant) {
      const eventKey = callbackEventKey(messageXml, { openCorpid, event, changeType });
      const eventRecord = await this.events.beginProcessing({
        source: "data",
        eventKey,
        tenantId: null,
        eventType: event,
        changeType,
        payloadEncrypted
      });
      if (eventRecord.shouldProcess) {
        await this.events.markDone(eventKey, null);
      }
      return { event: event ?? "unknown", changeType, tenantId: "", handled: false };
    }

    const eventKey = callbackEventKey(messageXml, { openCorpid, event, changeType });
    const eventRecord = await this.events.beginProcessing({
      source: "data",
      eventKey,
      tenantId: tenant.tenantId,
      eventType: event,
      changeType,
      payloadEncrypted
    });
    if (!eventRecord.shouldProcess) {
      return { event, changeType, tenantId: tenant.tenantId, handled: true };
    }

    try {
      if (changeType === "create_user" || changeType === "update_user") {
        await this.contacts.upsertMembers({
          tenantId: tenant.tenantId,
          tenantName: tenant.corpName,
          users: [
            {
              userid: readXmlText(messageXml, "NewUserID") ?? readXmlText(messageXml, "UserID"),
              openUserid: readXmlText(messageXml, "OpenUserID"),
              name: readXmlText(messageXml, "Name"),
              departmentIds: departmentIds(messageXml),
              status: "active"
            }
          ]
        });
        await this.events.markDone(eventKey, tenant.tenantId);
        return { event, changeType, tenantId: tenant.tenantId, handled: true };
      }

      if (changeType === "delete_user") {
        const handled = await this.contacts.disableMember({
          tenantId: tenant.tenantId,
          userid: readXmlText(messageXml, "UserID"),
          openUserid: readXmlText(messageXml, "OpenUserID")
        });
        await this.events.markDone(eventKey, tenant.tenantId);
        return { event, changeType, tenantId: tenant.tenantId, handled };
      }

      await this.events.markDone(eventKey, tenant.tenantId);
      return { event, changeType, tenantId: tenant.tenantId, handled: false };
    } catch (error) {
      try {
        const deadLetter = eventRecord.retryCount >= MAX_CALLBACK_RETRIES;
        await this.events.markFailed(eventKey, error, tenant.tenantId, { deadLetter });
        if (deadLetter) {
          await this.alerts.notifyDeadLetter({
            source: "data",
            eventKey,
            tenantId: tenant.tenantId,
            eventType: event,
            changeType,
            retryCount: eventRecord.retryCount,
            errorType: errorType(error)
          });
        }
      } catch {
        // Preserve the original callback processing error.
      }
      throw error;
    }
  }

  private decryptOptions() {
    const suite = this.config.suite;
    return {
      token: suite.dataCallbackToken,
      aesKey: suite.dataCallbackAesKey,
      expectedReceiveId: null
    };
  }
}

function errorType(error: unknown): string {
  return error instanceof Error ? error.constructor.name : typeof error;
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

function callbackEventKey(messageXml: string, input: { openCorpid: string; event: string; changeType: string | null }): string {
  const explicitMessageId = readXmlText(messageXml, "MsgId") ?? readXmlText(messageXml, "MsgID");
  if (explicitMessageId) {
    return `wecom:data:${input.openCorpid}:${explicitMessageId}`.slice(0, 128);
  }
  const digest = createHash("sha256")
    .update(
      [
        input.openCorpid,
        input.event,
        input.changeType ?? "",
        readXmlText(messageXml, "TimeStamp") ?? readXmlText(messageXml, "CreateTime") ?? "",
        readXmlText(messageXml, "UserID") ?? "",
        readXmlText(messageXml, "NewUserID") ?? "",
        readXmlText(messageXml, "OpenUserID") ?? ""
      ].join("\0")
    )
    .digest("hex");
  return `wecom:data:${digest}`;
}

function readXmlText(xml: string, tag: string): string | null {
  const match = xml.match(new RegExp(`<${tag}>\\s*(?:<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>|([\\s\\S]*?))\\s*</${tag}>`, "i"));
  const value = match?.[1] ?? match?.[2];
  return value?.trim() || null;
}

function departmentIds(messageXml: string): string[] {
  const raw = readXmlText(messageXml, "Department") ?? readXmlText(messageXml, "DepartmentId");
  return raw
    ? raw
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean)
    : [];
}
