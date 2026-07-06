import { Injectable } from "@nestjs/common";
import { qyLoginResponseSchema, type AuthCodeRequest, type QyLoginResponse } from "../contracts/auth.js";
import { SessionTokenService } from "../session/session-token.service.js";
import { AuthRepository } from "./auth.repository.js";

@Injectable()
export class AuthService {
  constructor(
    private readonly repository: AuthRepository,
    private readonly sessionTokens: SessionTokenService
  ) {}

  async qyLogin(request: AuthCodeRequest): Promise<QyLoginResponse> {
    const identity = await this.repository.resolveQyCode(request.code);
    const summary = this.repository.toSummary(identity);
    return qyLoginResponseSchema.parse({
      access_token: this.sessionTokens.sign(this.repository.toSession(identity)),
      token_type: "Bearer",
      expires_in: this.sessionTokens.expiresIn,
      account: {
        account_id: identity.accountId,
        status: "active"
      },
      current_identity: summary,
      identities: [summary]
    });
  }
}
