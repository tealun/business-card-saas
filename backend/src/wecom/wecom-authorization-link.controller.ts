import { BadRequestException, Body, Controller, Headers, Post } from "@nestjs/common";
import { wecomAuthorizationLinkRequestSchema } from "../contracts/wecom-authorization.js";
import { WecomAuthorizationLinkService } from "./wecom-authorization-link.service.js";

@Controller("wecom/authorization-links")
export class WecomAuthorizationLinkController {
  constructor(private readonly links: WecomAuthorizationLinkService) {}

  @Post()
  createAuthorizationLink(@Headers("x-wecom-launch-token") launchToken: string | undefined, @Body() body: unknown) {
    const result = wecomAuthorizationLinkRequestSchema.safeParse(body ?? {});
    if (!result.success) {
      throw new BadRequestException("invalid WeCom authorization link request");
    }
    return this.links.createAuthorizationLink(result.data, launchToken);
  }
}
