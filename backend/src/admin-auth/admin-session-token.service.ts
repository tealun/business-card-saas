import { Injectable, UnauthorizedException } from "@nestjs/common";
import { createHmac, timingSafeEqual } from "node:crypto";
import { readSecret } from "../common/secrets.js";
import type { AdminSession } from "./admin-session.js";

interface AdminTokenEnvelope {
  payload: AdminSession & {
    exp: number;
  };
  sig: string;
}

@Injectable()
export class AdminSessionTokenService {
  readonly expiresIn = 60 * 60 * 8;
  private readonly secret = readSecret("ADMIN_JWT_SECRET");

  sign(session: AdminSession): string {
    const payload = {
      ...session,
      exp: Math.floor(Date.now() / 1000) + this.expiresIn
    };
    const encodedPayload = this.encode(payload);
    const sig = this.signature(encodedPayload);
    return `${encodedPayload}.${sig}`;
  }

  verify(token: string): AdminSession {
    const [encodedPayload, sig] = token.split(".");
    if (!encodedPayload || !sig) {
      throw new UnauthorizedException("invalid admin access token");
    }

    const expected = this.signature(encodedPayload);
    if (!this.safeEqual(sig, expected)) {
      throw new UnauthorizedException("invalid admin access token");
    }

    const envelope = this.decode(encodedPayload);
    if (envelope.payload.exp < Math.floor(Date.now() / 1000)) {
      throw new UnauthorizedException("admin access token expired");
    }

    return {
      tenantId: envelope.payload.tenantId,
      tenantName: envelope.payload.tenantName,
      memberIdentityId: envelope.payload.memberIdentityId,
      openUserid: envelope.payload.openUserid,
      role: envelope.payload.role,
      accountType: envelope.payload.accountType === "platform" ? "platform" : "tenant"
    };
  }

  private encode(payload: AdminTokenEnvelope["payload"]): string {
    return Buffer.from(JSON.stringify({ payload })).toString("base64url");
  }

  private decode(encodedPayload: string): AdminTokenEnvelope {
    const decoded = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8")) as AdminTokenEnvelope;
    if (!decoded.payload) {
      throw new UnauthorizedException("invalid admin access token");
    }
    return decoded;
  }

  private signature(encodedPayload: string): string {
    return createHmac("sha256", this.secret).update(`v1.admin-session.${encodedPayload}`).digest("base64url");
  }

  private safeEqual(left: string, right: string): boolean {
    const leftBuffer = Buffer.from(left);
    const rightBuffer = Buffer.from(right);
    return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
  }
}
