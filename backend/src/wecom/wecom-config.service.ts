import { Injectable } from "@nestjs/common";

export interface WecomSuiteConfig {
  suiteId: string;
  suiteSecret: string;
  callbackToken: string;
  callbackAesKey: string;
}

const devDefaults: WecomSuiteConfig = {
  suiteId: "dev-wecom-suite-id",
  suiteSecret: "dev-only-wecom-suite-secret",
  callbackToken: "dev-only-wecom-callback-token",
  callbackAesKey: "abcdefghijklmnopqrstuvwxyz0123456789ABCDEFG"
};

@Injectable()
export class WecomConfigService {
  get suite(): WecomSuiteConfig {
    const suite = {
      suiteId: readRequired("WECOM_SUITE_ID", devDefaults.suiteId),
      suiteSecret: readRequired("WECOM_SUITE_SECRET", devDefaults.suiteSecret),
      callbackToken: readRequired("WECOM_CALLBACK_TOKEN", devDefaults.callbackToken),
      callbackAesKey: readRequired("WECOM_CALLBACK_AES_KEY", devDefaults.callbackAesKey)
    };
    if (suite.callbackAesKey.length !== 43) {
      throw new Error("WECOM_CALLBACK_AES_KEY must be 43 characters");
    }
    return suite;
  }

  get apiBaseUrl(): string {
    return readRequired("WECOM_API_BASE_URL", "https://qyapi.weixin.qq.com").replace(/\/+$/, "");
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
