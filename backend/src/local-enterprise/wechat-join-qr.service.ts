import { BadGatewayException, Injectable, ServiceUnavailableException } from "@nestjs/common";
import { AppConfig } from "../config/app-config.js";

interface WechatApiPayload {
  access_token?: string;
  expires_in?: number;
  errcode?: number;
  errmsg?: string;
}

const REFRESHABLE_TOKEN_ERRORS = new Set([40001, 40014, 42001]);

class WechatTokenExpiredError extends Error {}

@Injectable()
export class WechatJoinQrService {
  private cached: { token: string; expiresAt: number } | null = null;
  private tokenRequest: Promise<string> | null = null;

  constructor(private readonly config: AppConfig) {}

  async generate(joinToken: string): Promise<string> {
    return this.generateScene(joinToken, "pages/enterprise-join/index");
  }

  async generateScene(scene: string, page: string): Promise<string> {
    this.ensureCredentials();
    return this.generateCode(
      (accessToken) =>
        fetch(`https://api.weixin.qq.com/wxa/getwxacodeunlimit?access_token=${encodeURIComponent(accessToken)}`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ scene, page, check_path: false, env_version: "release", width: 430 })
        }),
      "WeChat Mini Program code"
    );
  }

  async generatePath(path: string): Promise<string> {
    this.ensureCredentials();
    return this.generateCode(
      (accessToken) =>
        fetch(`https://api.weixin.qq.com/wxa/getwxacode?access_token=${encodeURIComponent(accessToken)}`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ path: path.replace(/^\/+/, ""), check_path: false, env_version: "release", width: 430 })
        }),
      "WeChat Mini Program code"
    );
  }

  private async generateCode(request: (accessToken: string) => Promise<Response>, context: string): Promise<string> {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const accessToken = await this.accessToken(attempt > 0);
      try {
        return await this.imageResponseDataUrl(await request(accessToken), context);
      } catch (error) {
        if (!(error instanceof WechatTokenExpiredError) || attempt > 0) throw error;
      }
    }
    throw new BadGatewayException(`${context} failed after refreshing access token`);
  }

  private async accessToken(forceRefresh = false): Promise<string> {
    if (!forceRefresh && this.cached && this.cached.expiresAt > Date.now()) return this.cached.token;
    if (forceRefresh) this.cached = null;
    if (this.tokenRequest) return this.tokenRequest;

    this.tokenRequest = this.fetchStableAccessToken(forceRefresh).finally(() => {
      this.tokenRequest = null;
    });
    return this.tokenRequest;
  }

  private async fetchStableAccessToken(forceRefresh: boolean): Promise<string> {
    const response = await fetch("https://api.weixin.qq.com/cgi-bin/stable_token", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        grant_type: "client_credential",
        appid: this.config.wechatMiniProgramAppId,
        secret: this.config.wechatMiniProgramSecret,
        force_refresh: forceRefresh
      })
    });
    if (!response.ok) throw new ServiceUnavailableException(`WeChat stable access token HTTP ${response.status}`);
    const payload = (await response.json()) as WechatApiPayload;
    if (!payload.access_token) {
      throw new BadGatewayException(`WeChat stable access token failed: ${payload.errcode ?? "unknown"} ${payload.errmsg ?? ""}`.trim());
    }
    this.cached = {
      token: payload.access_token,
      expiresAt: Date.now() + Math.max(60, (payload.expires_in ?? 7200) - 300) * 1000
    };
    return payload.access_token;
  }

  private ensureCredentials(): void {
    if (!this.config.wechatMiniProgramAppId || !this.config.wechatMiniProgramSecret) {
      throw new ServiceUnavailableException("WeChat Mini Program credentials are required to generate QR codes");
    }
  }

  private async imageResponseDataUrl(response: Response, context: string): Promise<string> {
    if (!response.ok) throw new ServiceUnavailableException(`${context} HTTP ${response.status}`);
    const contentType = response.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      const error = (await response.json()) as WechatApiPayload;
      if (error.errcode !== undefined && REFRESHABLE_TOKEN_ERRORS.has(error.errcode)) {
        throw new WechatTokenExpiredError(error.errmsg || "WeChat access token expired");
      }
      throw new BadGatewayException(`${context} failed: ${error.errcode ?? "unknown"} ${error.errmsg ?? ""}`.trim());
    }
    const bytes = Buffer.from(await response.arrayBuffer());
    return `data:${contentType || "image/png"};base64,${bytes.toString("base64")}`;
  }
}
