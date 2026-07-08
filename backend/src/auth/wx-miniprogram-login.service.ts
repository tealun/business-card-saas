import { BadGatewayException, Injectable, ServiceUnavailableException } from "@nestjs/common";
import { AppConfig } from "../config/app-config.js";

export interface WxMiniProgramSession {
  openid: string;
  unionid: string | null;
  sessionKey: string | null;
}

interface WxSessionPayload {
  errcode?: number;
  errmsg?: string;
  openid?: string;
  unionid?: string;
  session_key?: string;
}

@Injectable()
export class WxMiniProgramLoginService {
  constructor(private readonly config: AppConfig) {}

  async resolveJsCode(code: string): Promise<WxMiniProgramSession> {
    const normalizedCode = code.trim();
    if (!normalizedCode) {
      throw new BadGatewayException("empty WeChat login code");
    }
    if (normalizedCode === "demo-wx-code" && !this.config.isProduction) {
      return {
        openid: "wx_openid_demo0001",
        unionid: "wx_unionid_demo0001",
        sessionKey: "demo-session-key"
      };
    }
    if (!this.config.wechatMiniProgramAppId || !this.config.wechatMiniProgramSecret) {
      throw new ServiceUnavailableException("WeChat miniprogram credentials are not configured");
    }

    const url = new URL("https://api.weixin.qq.com/sns/jscode2session");
    url.searchParams.set("appid", this.config.wechatMiniProgramAppId);
    url.searchParams.set("secret", this.config.wechatMiniProgramSecret);
    url.searchParams.set("js_code", normalizedCode);
    url.searchParams.set("grant_type", "authorization_code");

    const abort = new AbortController();
    const timeout = setTimeout(() => abort.abort(), this.config.wechatHttpTimeoutMs);
    try {
      const response = await fetch(url, { signal: abort.signal });
      if (!response.ok) {
        throw new ServiceUnavailableException(`WeChat jscode2session HTTP ${response.status}`);
      }
      const payload = (await response.json()) as WxSessionPayload;
      if (payload.errcode && payload.errcode !== 0) {
        throw new BadGatewayException(`WeChat jscode2session failed: ${payload.errcode} ${payload.errmsg ?? ""}`.trim());
      }
      if (!payload.openid) {
        throw new BadGatewayException("WeChat jscode2session returned invalid payload");
      }
      return {
        openid: payload.openid,
        unionid: payload.unionid ?? null,
        sessionKey: payload.session_key ?? null
      };
    } finally {
      clearTimeout(timeout);
    }
  }
}
