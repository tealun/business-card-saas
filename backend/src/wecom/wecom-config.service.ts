import { Injectable } from "@nestjs/common";

export interface WecomSuiteConfig {
  suiteId: string;
  suiteSecret: string;
  callbackToken: string;
  callbackAesKey: string;
  dataCallbackToken: string;
  dataCallbackAesKey: string;
}

const devDefaults: WecomSuiteConfig = {
  suiteId: "dev-wecom-suite-id",
  suiteSecret: "dev-only-wecom-suite-secret",
  callbackToken: "dev-only-wecom-callback-token",
  callbackAesKey: "abcdefghijklmnopqrstuvwxyz0123456789ABCDEFG",
  dataCallbackToken: "dev-only-wecom-data-callback-token",
  dataCallbackAesKey: "abcdefghijklmnopqrstuvwxyz0123456789ABCDEFG"
};

@Injectable()
export class WecomConfigService {
  get suite(): WecomSuiteConfig {
    const callbackToken = readRequired("WECOM_CALLBACK_TOKEN", devDefaults.callbackToken);
    const callbackAesKey = readRequired("WECOM_CALLBACK_AES_KEY", devDefaults.callbackAesKey);
    const suite = {
      suiteId: readRequired("WECOM_SUITE_ID", devDefaults.suiteId),
      suiteSecret: readRequired("WECOM_SUITE_SECRET", devDefaults.suiteSecret),
      callbackToken,
      callbackAesKey,
      dataCallbackToken: readRequired(
        "WECOM_DATA_CALLBACK_TOKEN",
        process.env.NODE_ENV === "production" ? "" : callbackToken || devDefaults.dataCallbackToken
      ),
      dataCallbackAesKey: readRequired(
        "WECOM_DATA_CALLBACK_AES_KEY",
        process.env.NODE_ENV === "production" ? "" : callbackAesKey || devDefaults.dataCallbackAesKey
      )
    };
    if (suite.callbackAesKey.length !== 43) {
      throw new Error("WECOM_CALLBACK_AES_KEY must be 43 characters");
    }
    if (suite.dataCallbackAesKey.length !== 43) {
      throw new Error("WECOM_DATA_CALLBACK_AES_KEY must be 43 characters");
    }
    return suite;
  }

  get apiBaseUrl(): string {
    return readRequired("WECOM_API_BASE_URL", "https://qyapi.weixin.qq.com").replace(/\/+$/, "");
  }

  get httpTimeoutMs(): number {
    const raw = readRequired("WECOM_HTTP_TIMEOUT_MS", "5000");
    const timeout = Number(raw);
    if (!Number.isFinite(timeout) || timeout <= 0) {
      throw new Error("WECOM_HTTP_TIMEOUT_MS must be a positive number");
    }
    return timeout;
  }
}

function readRequired(name: string, fallback: string): string {
  const value = process.env[name]?.trim();
  if (value) {
    return value;
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error(`${name} must be set in production`);
  }
  return fallback;
}
