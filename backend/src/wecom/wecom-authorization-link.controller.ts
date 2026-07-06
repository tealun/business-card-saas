import { Body, Controller, Headers, Post } from "@nestjs/common";
import { wecomAuthorizationLinkRequestSchema } from "../contracts/wecom-authorization.js";
import { WecomAuthorizationLinkService } from "./wecom-authorization-link.service.js";

@Controller("wecom/authorization-links")
export class WecomAuthorizationLinkController {
  constructor(private readonly links: WecomAuthorizationLinkService) {}

  @Post()
  createAuthorizationLink(@Headers("x-wecom-launch-token") launchToken: string | undefined, @Body() body: unknown) {
    return this.links.createAuthorizationLink(wecomAuthorizationLinkRequestSchema.parse(body ?? {}), launchToken);
  }
}
