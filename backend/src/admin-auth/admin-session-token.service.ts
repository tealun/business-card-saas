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

  /**
   * 签发后台管理会话 token。
   *
   * token 只保存会话必要身份信息和过期时间，权限是否仍有效由 Guard/服务层在请求时
   * 再次校验，避免被禁用的平台账号继续使用旧 token。
   */
  sign(session: AdminSession): string {
    const payload = {
      ...session,
      exp: Math.floor(Date.now() / 1000) + this.expiresIn
    };
    const encodedPayload = this.encode(payload);
    const sig = this.signature(encodedPayload);
    return `${encodedPayload}.${sig}`;
  }

  /**
   * 校验后台管理会话 token 并返回规范化后的会话。
   *
   * 这里负责签名、过期时间和旧 token 兼容；不在这里授予权限，调用方必须继续执行
   * RBAC 或平台账号状态校验。
   */
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
      // 旧租户 token 没有 accountType；只有显式 platform 才按平台会话处理，避免误推断平台权限。
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
    // 加入用途前缀做域隔离，防止其他 token 家族的 HMAC 在密钥误共用时被重放为后台会话。
    return createHmac("sha256", this.secret).update(`v1.admin-session.${encodedPayload}`).digest("base64url");
  }

  private safeEqual(left: string, right: string): boolean {
    const leftBuffer = Buffer.from(left);
    const rightBuffer = Buffer.from(right);
    return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
  }
}
