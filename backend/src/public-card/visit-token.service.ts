import { createHmac, timingSafeEqual } from "node:crypto";
import { Injectable, UnauthorizedException } from "@nestjs/common";

export interface VisitTokenPayload {
  visitId: string;
  publicId: string;
  shareId: string | null;
  nonce: string;
  issuedAt: number;
}

@Injectable()
export class VisitTokenService {
  private readonly ttlSeconds = 30 * 60;

  sign(payload: Omit<VisitTokenPayload, "issuedAt">): string {
    const fullPayload: VisitTokenPayload = {
      ...payload,
      issuedAt: Math.floor(Date.now() / 1000)
    };
    const encoded = Buffer.from(JSON.stringify(fullPayload), "utf8").toString("base64url");
    const signature = this.signature(encoded);
    return `${encoded}.${signature}`;
  }

  verify(token: string): VisitTokenPayload {
    const [encoded, signature] = token.split(".");
    if (!encoded || !signature) {
      throw new UnauthorizedException("invalid visit_token");
    }

    const expected = this.signature(encoded);
    if (!this.safeEqual(signature, expected)) {
      throw new UnauthorizedException("invalid visit_token");
    }

    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as VisitTokenPayload;
    const now = Math.floor(Date.now() / 1000);
    if (now - payload.issuedAt > this.ttlSeconds) {
      throw new UnauthorizedException("visit_token expired");
    }
    return payload;
  }

  get expiresIn() {
    return this.ttlSeconds;
  }

  private signature(encodedPayload: string): string {
    const secret = process.env.VISIT_TOKEN_SECRET ?? "dev-only-change-me";
    return createHmac("sha256", secret).update(encodedPayload).digest("base64url");
  }

  private safeEqual(a: string, b: string): boolean {
    const left = Buffer.from(a);
    const right = Buffer.from(b);
    return left.length === right.length && timingSafeEqual(left, right);
  }
}
