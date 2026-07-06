import { BadGatewayException, Injectable, ServiceUnavailableException } from "@nestjs/common";
import { WecomConfigService } from "./wecom-config.service.js";

export interface FetchSuiteTokenRequest {
  suiteId: string;
  suiteSecret: string;
  suiteTicket: string;
}

export interface FetchSuiteTokenResponse {
  suiteAccessToken: string;
  expiresIn: number;
}

interface WecomSuiteTokenPayload {
  errcode?: number;
  errmsg?: string;
  suite_access_token?: string;
  expires_in?: number;
}

@Injectable()
export class WecomApiClientService {
  constructor(private readonly config: WecomConfigService) {}

  async fetchSuiteAccessToken(request: FetchSuiteTokenRequest): Promise<FetchSuiteTokenResponse> {
    const response = await fetch(`${this.config.apiBaseUrl}/cgi-bin/service/get_suite_token`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        suite_id: request.suiteId,
        suite_secret: request.suiteSecret,
        suite_ticket: request.suiteTicket
      })
    });
    if (!response.ok) {
      throw new ServiceUnavailableException(`WeCom get_suite_token HTTP ${response.status}`);
    }

    const payload = (await response.json()) as WecomSuiteTokenPayload;
    if (payload.errcode && payload.errcode !== 0) {
      throw new BadGatewayException(`WeCom get_suite_token failed: ${payload.errcode} ${payload.errmsg ?? ""}`.trim());
    }
    if (!payload.suite_access_token || !payload.expires_in || payload.expires_in <= 0) {
      throw new BadGatewayException("WeCom get_suite_token returned invalid payload");
    }

    return {
      suiteAccessToken: payload.suite_access_token,
      expiresIn: payload.expires_in
    };
  }
}
