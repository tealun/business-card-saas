import { Injectable, UnauthorizedException } from "@nestjs/common";
import { timingSafeEqual } from "node:crypto";
import { randomToken } from "../common/id.js";
import {
  wecomAuthorizationLinkResponseSchema,
  type WecomAuthorizationLinkRequest,
  type WecomAuthorizationLinkResponse
} from "../contracts/wecom-authorization.js";
import { WecomApiClientService } from "./wecom-api-client.service.js";
import { WecomConfigService } from "./wecom-config.service.js";
import { WecomSuiteTokenService } from "./wecom-suite-token.service.js";

@Injectable()
export class WecomAuthorizationLinkService {
  constructor(
    private readonly config: WecomConfigService,
    private readonly suiteTokens: WecomSuiteTokenService,
    private readonly api: WecomApiClientService
  ) {}

  async createAuthorizationLink(
    request: WecomAuthorizationLinkRequest,
    launchToken: string | undefined
  ): Promise<WecomAuthorizationLinkResponse> {
    if (!this.isValidLaunchToken(launchToken)) {
      throw new UnauthorizedException("WeCom authorization launch token required");
    }

    const suiteToken = await this.suiteTokens.getSuiteAccessToken();
    const preAuth = await this.api.fetchPreAuthCode({ suiteAccessToken: suiteToken.accessToken });
    const authType = request.auth_type === "test" ? 1 : 0;
    const sessionRequest: {
      suiteAccessToken: string;
      preAuthCode: string;
      authType: 0 | 1;
      appIds?: string[];
    } = {
      suiteAccessToken: suiteToken.accessToken,
      preAuthCode: preAuth.preAuthCode,
      authType
    };
    if (request.app_ids?.length) {
      sessionRequest.appIds = request.app_ids;
    }
    await this.api.setSessionInfo(sessionRequest);

    const redirectUri = request.redirect_uri ?? this.config.authorizationRedirectUri;
    const state = request.state ?? randomToken("wcauth", 12);
    const authorizationUrl = new URL(this.config.authorizationInstallBaseUrl);
    authorizationUrl.searchParams.set("suite_id", this.config.suite.suiteId);
    authorizationUrl.searchParams.set("pre_auth_code", preAuth.preAuthCode);
    authorizationUrl.searchParams.set("redirect_uri", redirectUri);
    authorizationUrl.searchParams.set("state", state);

    return wecomAuthorizationLinkResponseSchema.parse({
      authorization_url: authorizationUrl.toString(),
      suite_id: this.config.suite.suiteId,
      pre_auth_code_expires_in: preAuth.expiresIn,
      redirect_uri: redirectUri,
      state,
      auth_type: request.auth_type
    });
  }

  private isValidLaunchToken(input: string | undefined): boolean {
    const token = input?.trim();
    if (!token) {
      return false;
    }
    const expected = this.config.authorizationLaunchToken;
    const actualBuffer = Buffer.from(token);
    const expectedBuffer = Buffer.from(expected);
    return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);
  }
}
