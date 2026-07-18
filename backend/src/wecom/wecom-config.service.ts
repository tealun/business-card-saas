import { Injectable } from "@nestjs/common";

export interface WecomSuiteConfig {
  providerCorpId: string;
  suiteId: string;
  suiteSecret: string;
  callbackToken: string;
  callbackAesKey: string;
  dataCallbackToken: string;
  dataCallbackAesKey: string;
}

@Injectable()
export class WecomConfigService {
  get suite(): WecomSuiteConfig {
    const callbackToken = readRequired("WECOM_CALLBACK_TOKEN");
    const callbackAesKey = readRequired("WECOM_CALLBACK_AES_KEY");
    const suite = {
      providerCorpId: readRequired("WECOM_PROVIDER_CORP_ID"),
      suiteId: readRequired("WECOM_SUITE_ID"),
      suiteSecret: readRequired("WECOM_SUITE_SECRET"),
      callbackToken,
      callbackAesKey,
      dataCallbackToken: readRequired("WECOM_DATA_CALLBACK_TOKEN"),
      dataCallbackAesKey: readRequired("WECOM_DATA_CALLBACK_AES_KEY")
    };
    if (suite.callbackAesKey.length !== 43) {
      throw new Error("WECOM_CALLBACK_AES_KEY must be 43 characters");
    }
    if (suite.dataCallbackAesKey.length !== 43) {
      throw new Error("WECOM_DATA_CALLBACK_AES_KEY must be 43 characters");
    }
    return suite;
  }

  get suiteId(): string {
    return readRequired("WECOM_SUITE_ID");
  }

  get apiBaseUrl(): string {
    return readRequired("WECOM_API_BASE_URL").replace(/\/+$/, "");
  }

  get httpTimeoutMs(): number {
    const raw = readRequired("WECOM_HTTP_TIMEOUT_MS");
    const timeout = Number(raw);
    if (!Number.isFinite(timeout) || timeout <= 0) {
      throw new Error("WECOM_HTTP_TIMEOUT_MS must be a positive number");
    }
    return timeout;
  }

  get authorizationInstallBaseUrl(): string {
    return readRequired("WECOM_INSTALL_BASE_URL").replace(/\/+$/, "");
  }

  get authorizationRedirectUri(): string {
    return readRequired("WECOM_INSTALL_REDIRECT_URI").replace(/\/+$/, "");
  }

  get authorizationLaunchToken(): string {
    return readRequired("WECOM_AUTH_LAUNCH_TOKEN");
  }

  get sensitiveAuthorizationRedirectUri(): string {
    return readRequired("WECOM_SENSITIVE_REDIRECT_URI");
  }

  get adminLoginRedirectUri(): string {
    return readRequired("WECOM_ADMIN_LOGIN_REDIRECT_URI");
  }

  get callbackAlertWebhookUrl(): string | null {
    return readOptional("WECOM_CALLBACK_ALERT_WEBHOOK_URL");
  }

  get callbackAlertWebhookToken(): string | null {
    return readOptional("WECOM_CALLBACK_ALERT_WEBHOOK_TOKEN");
  }
}

function readRequired(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} must be set`);
  }
  return value;
}

function readOptional(name: string): string | null {
  return process.env[name]?.trim() || null;
}
