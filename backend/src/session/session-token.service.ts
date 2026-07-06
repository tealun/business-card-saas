import { Injectable, UnauthorizedException } from "@nestjs/common";
import { createHmac, timingSafeEqual } from "node:crypto";
import type { EmployeeSession } from "./employee-session.js";
import { readSecret } from "../common/secrets.js";

interface TokenEnvelope {
  payload: EmployeeSession & {
    exp: number;
  };
  sig: string;
}

@Injectable()
export class SessionTokenService {
  readonly expiresIn = 60 * 60 * 24;
  private readonly secret = readSecret("JWT_SECRET", "dev-only-change-me");

  sign(session: EmployeeSession): string {
    const payload = {
      ...session,
      exp: Math.floor(Date.now() / 1000) + this.expiresIn
    };
    const encodedPayload = this.encode(payload);
    const sig = this.signature(encodedPayload);
    return `${encodedPayload}.${sig}`;
  }

  verify(token: string): EmployeeSession {
    const [encodedPayload, sig] = token.split(".");
    if (!encodedPayload || !sig) {
      throw new UnauthorizedException("invalid access token");
    }

    const expected = this.signature(encodedPayload);
    if (!this.safeEqual(sig, expected)) {
      throw new UnauthorizedException("invalid access token");
    }

    const envelope = this.decode(encodedPayload);
    if (envelope.payload.exp < Math.floor(Date.now() / 1000)) {
      throw new UnauthorizedException("access token expired");
    }

    return {
      accountId: envelope.payload.accountId,
      tenantId: envelope.payload.tenantId,
      memberIdentityId: envelope.payload.memberIdentityId,
      openUserid: envelope.payload.openUserid
    };
  }

  private encode(payload: TokenEnvelope["payload"]): string {
    return Buffer.from(JSON.stringify({ payload })).toString("base64url");
  }

  private decode(encodedPayload: string): TokenEnvelope {
    const decoded = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8")) as TokenEnvelope;
    if (!decoded.payload) {
      throw new UnauthorizedException("invalid access token");
    }
    return decoded;
  }

  private signature(encodedPayload: string): string {
    // Domain-separated so a session token can never validate as another token family (A12-P2-2).
    return createHmac("sha256", this.secret).update(`v1.session.${encodedPayload}`).digest("base64url");
  }

  private safeEqual(left: string, right: string): boolean {
    const leftBuffer = Buffer.from(left);
    const rightBuffer = Buffer.from(right);
    return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
  }
}
