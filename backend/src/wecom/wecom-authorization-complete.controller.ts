import { BadRequestException, Controller, Get, Query } from "@nestjs/common";
import {
  wecomAuthorizationCompleteQuerySchema,
  wecomAuthorizationCompleteResponseSchema,
  type WecomAuthorizationCompleteResponse
} from "../contracts/wecom-authorization.js";
import { WecomAuthorizationService } from "./wecom-authorization.service.js";
import { WecomAuthorizationLinkService } from "./wecom-authorization-link.service.js";

@Controller("wecom/authorization-complete")
export class WecomAuthorizationCompleteController {
  constructor(
    private readonly authorization: WecomAuthorizationService,
    private readonly authorizationLinks: WecomAuthorizationLinkService
  ) {}

  @Get()
  async complete(@Query() queryInput: unknown): Promise<WecomAuthorizationCompleteResponse> {
    const query = parseQuery(queryInput);
    const state = this.authorizationLinks.consumeState(query.state);
    const tenant = await this.authorization.handleAuthCode(query.auth_code);
    const response = {
      handled: true as const,
      tenant_id: tenant.tenantId,
      open_corpid: tenant.openCorpid,
      corp_name: tenant.corpName,
      auth_status: tenant.authStatus
    };
    return wecomAuthorizationCompleteResponseSchema.parse(
      {
        ...response,
        state
      }
    );
  }
}

function parseQuery(queryInput: unknown) {
  const result = wecomAuthorizationCompleteQuerySchema.safeParse(queryInput);
  if (!result.success) {
    throw new BadRequestException("invalid WeCom authorization callback query");
  }
  return result.data;
}
