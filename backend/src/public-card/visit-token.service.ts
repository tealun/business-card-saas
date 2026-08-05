import { createHmac, timingSafeEqual } from "node:crypto";
import { Injectable, UnauthorizedException } from "@nestjs/common";
import { readSecret } from "../common/secrets.js";

export interface VisitTokenPayload {
  visitId: string;
  publicId: string;
  shareId: string | null;
  nonce: string;
  issuedAt: number;
}

@Injectable()
export class VisitTokenService {
  // visit_token 只连接公开名片加载和访问统计写入，窗口要短，避免公开分享链接扩大写入面。
  private readonly ttlSeconds = 30 * 60;

  /**
   * 签发一次公开名片访问 token。
   *
   * token 内含本次访问、公开名片、分享来源和随机数，供后续统计接口归因；调用方不传
   * issuedAt，时间由服务端统一写入。
   */
  sign(payload: Omit<VisitTokenPayload, "issuedAt">): string {
    const fullPayload: VisitTokenPayload = {
      ...payload,
      issuedAt: Math.floor(Date.now() / 1000)
    };
    const encoded = Buffer.from(JSON.stringify(fullPayload), "utf8").toString("base64url");
    const signature = this.signature(encoded);
    return `${encoded}.${signature}`;
  }

  /**
   * 校验公开名片访问 token，并返回原始访问载荷。
   *
   * 只校验签名和最大年龄，不把它提升为用户身份；过期或伪造 token 统一按未授权处理。
   */
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
    // 使用服务端最大年龄，而不是信任调用方写入的绝对过期时间。
    if (now - payload.issuedAt > this.ttlSeconds) {
      throw new UnauthorizedException("visit_token expired");
    }
    return payload;
  }

  get expiresIn() {
    return this.ttlSeconds;
  }

  private signature(encodedPayload: string): string {
    const secret = readSecret("VISIT_TOKEN_SECRET");
    // 与可能共用密钥的 session/anon HMAC 做用途隔离（A12-P2-2）。
    return createHmac("sha256", secret).update(`v1.visit.${encodedPayload}`).digest("base64url");
  }

  private safeEqual(a: string, b: string): boolean {
    const left = Buffer.from(a);
    const right = Buffer.from(b);
    return left.length === right.length && timingSafeEqual(left, right);
  }
}
