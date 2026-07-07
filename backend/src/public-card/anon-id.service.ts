import { createHmac, timingSafeEqual } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { readSecret } from "../common/secrets.js";
import { randomToken } from "../common/id.js";

// A12-P1-1: anonymous visitor ids must be server-signed so clients cannot forge
// or replay another visitor's anon_id and poison UV dedup / attribution.
@Injectable()
export class AnonIdService {
  issue(): string {
    const value = randomToken("anon", 18);
    return `${value}.${this.signature(value)}`;
  }

  // Returns the candidate only when it carries a valid signature; otherwise null,
  // so callers fall back to issuing a fresh anon_id instead of trusting input.
  verify(candidate: string | undefined): string | null {
    if (!candidate) {
      return null;
    }
    const separator = candidate.lastIndexOf(".");
    if (separator <= 0) {
      return null;
    }
    const value = candidate.slice(0, separator);
    const signature = candidate.slice(separator + 1);
    if (!value.startsWith("anon_") || !this.safeEqual(signature, this.signature(value))) {
      return null;
    }
    return candidate;
  }

  private signature(value: string): string {
    const secret = readSecret("VISIT_TOKEN_SECRET");
    return createHmac("sha256", secret).update(`v1.anon.${value}`).digest("base64url");
  }

  private safeEqual(a: string, b: string): boolean {
    const left = Buffer.from(a);
    const right = Buffer.from(b);
    return left.length === right.length && timingSafeEqual(left, right);
  }
}
