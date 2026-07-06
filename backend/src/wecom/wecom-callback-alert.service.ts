import { Injectable } from "@nestjs/common";
import { createHash } from "node:crypto";
import { WecomConfigService } from "./wecom-config.service.js";

export interface WecomDeadLetterAlertInput {
  source: "data";
  eventKey: string;
  tenantId: string | null;
  eventType: string;
  changeType: string | null;
  retryCount: number;
  errorType: string;
}

export interface WecomDeadLetterAlertResult {
  sent: boolean;
  status: number | null;
  skipped: boolean;
}

@Injectable()
export class WecomCallbackAlertService {
  constructor(private readonly config: WecomConfigService) {}

  async notifyDeadLetter(input: WecomDeadLetterAlertInput): Promise<WecomDeadLetterAlertResult> {
    const webhookUrl = this.config.callbackAlertWebhookUrl;
    if (!webhookUrl) {
      return { sent: false, status: null, skipped: true };
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.httpTimeoutMs);
    try {
      const headers: Record<string, string> = {
        "content-type": "application/json"
      };
      const token = this.config.callbackAlertWebhookToken;
      if (token) {
        headers.authorization = `Bearer ${token}`;
      }
      const response = await fetch(webhookUrl, {
        method: "POST",
        headers,
        body: JSON.stringify({
          type: "wecom_callback_dead_letter",
          source: input.source,
          event_key_hash: hashEventKey(input.eventKey),
          tenant_id: input.tenantId,
          event_type: input.eventType,
          change_type: input.changeType,
          retry_count: input.retryCount,
          error_type: input.errorType
        }),
        signal: controller.signal
      });
      return { sent: response.ok, status: response.status, skipped: false };
    } catch {
      return { sent: false, status: null, skipped: false };
    } finally {
      clearTimeout(timeout);
    }
  }
}

function hashEventKey(eventKey: string): string {
  return createHash("sha256").update(eventKey).digest("hex");
}
