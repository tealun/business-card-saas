import { Injectable, Logger } from "@nestjs/common";
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
  private readonly logger = new Logger(WecomCallbackAlertService.name);

  constructor(private readonly config: WecomConfigService) {}

  async notifyDeadLetter(input: WecomDeadLetterAlertInput): Promise<WecomDeadLetterAlertResult> {
    const webhookUrl = this.config.callbackAlertWebhookUrl;
    if (!webhookUrl) {
      return { sent: false, status: null, skipped: true };
    }

    const maxRetries = 3;
    const baseDelayMs = 500;
    let lastError: Error | undefined;

    for (let attempt = 0; attempt < maxRetries; attempt += 1) {
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
            retry_count: input.retryCount,
            error_type: input.errorType
          }),
          signal: controller.signal
        });
        const result = { sent: response.ok, status: response.status, skipped: false };
        if (response.ok) {
          return result;
        }
        lastError = new Error(`HTTP ${response.status}`);
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
      } finally {
        clearTimeout(timeout);
      }

      if (attempt < maxRetries - 1) {
        this.logger.warn(`Dead-letter alert attempt ${attempt + 1} failed, retrying in ${baseDelayMs * 2 ** attempt}ms: ${lastError.message}`);
        await delay(baseDelayMs * 2 ** attempt);
      }
    }

    this.logger.error(`Dead-letter alert failed after ${maxRetries} attempts: ${lastError?.message}`);
    return { sent: false, status: null, skipped: false };
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function hashEventKey(eventKey: string): string {
  return createHash("sha256").update(eventKey).digest("hex");
}
