import { ForbiddenException, Injectable, UnauthorizedException } from "@nestjs/common";
import { createHmac } from "node:crypto";
import { readSecret } from "../common/secrets.js";
import {
  actionResponseSchema,
  type ActionRequest,
  type ActionResponse,
  deriveShareResponseSchema,
  type DeriveShareRequest,
  type DeriveShareResponse,
  type PublicCardResponse,
  publicCardResponseSchema,
  type VisitRequest,
  type VisitResponse,
  visitResponseSchema
} from "../contracts/public-card.js";
import { PublicCardRepository } from "./public-card.repository.js";
import { VisitTokenService } from "./visit-token.service.js";
import { AnonIdService } from "./anon-id.service.js";
import { randomToken } from "../common/id.js";
import { SessionTokenService } from "../session/session-token.service.js";
import type { EmployeeSession } from "../session/employee-session.js";

interface VisitContext {
  token?: string;
  ipAddress?: string;
}

@Injectable()
export class PublicCardService {
  constructor(
    private readonly repository: PublicCardRepository,
    private readonly visitTokens: VisitTokenService,
    private readonly anonIds: AnonIdService,
    private readonly sessionTokens: SessionTokenService
  ) {}

  /**
   * 读取公开名片展示数据。
   *
   * 仅按 publicId 读取可公开展示的字段，返回前通过契约 schema 过滤结构，
   * 避免员工端私有字段进入公开页面。
   */
  async getPublicCard(publicId: string): Promise<PublicCardResponse> {
    return publicCardResponseSchema.parse(await this.repository.findPublicCard(publicId));
  }

  /**
   * 创建或恢复一次公开名片访问，并签发后续行为使用的 visit_token。
   *
   * 若访问者带有本人名片会话且访问自己的公开名片，只返回统计和临时 visit_token，
   * 不写入新的访问记录，避免本人预览污染访客数据。
   */
  async createVisit(publicId: string, request: VisitRequest, context: VisitContext = {}): Promise<VisitResponse> {
    const session = this.optionalSession(context.token);
    const ipHash = hashIp(context.ipAddress);
    const anonId = this.resolveAnonId(request, session);
    if (session?.publicId === publicId) {
      const stats = await this.repository.getStats(publicId, anonId);
      const visitId = randomToken("vis", 18);
      const visitToken = this.visitTokens.sign({
        visitId,
        publicId,
        shareId: request.share ?? null,
        nonce: randomToken("nonce", 12)
      });
      return visitResponseSchema.parse({
        visit_id: visitId,
        visit_token: visitToken,
        anon_id: anonId,
        is_owner: true,
        expires_in: this.visitTokens.expiresIn,
        stats
      });
    }

    const visitInput: {
      publicId: string;
      shareId?: string;
      anonId: string;
      userAgent?: string;
      ipHash?: string;
      trustLevel?: string;
    } = {
      publicId,
      anonId,
      trustLevel: session ? "authenticated_user" : "anonymous_client"
    };
    if (request.user_agent) {
      visitInput.userAgent = request.user_agent;
    }
    if (ipHash) {
      visitInput.ipHash = ipHash;
    }
    if (request.share) {
      visitInput.shareId = request.share;
    }
    const visit = await this.repository.createVisit(visitInput);
    const visitToken = this.visitTokens.sign({
      visitId: visit.visitId,
      publicId,
      shareId: visit.shareId,
      nonce: randomToken("nonce", 12)
    });
    const stats = await this.repository.getStats(publicId, visit.anonId);

    return visitResponseSchema.parse({
      visit_id: visit.visitId,
      visit_token: visitToken,
      anon_id: visit.anonId,
      is_owner: false,
      expires_in: this.visitTokens.expiresIn,
      stats
    });
  }

  /**
   * 解析匿名访客标识。
   *
   * 已登录成员使用稳定的成员维度 anon_id；匿名访客必须携带服务端签名过的 anon_id，
   * 否则重新签发，防止客户端伪造访客身份。
   */
  private resolveAnonId(request: VisitRequest, session: EmployeeSession | undefined): string {
    if (session) {
      return this.anonIds.issueStable("member", session.memberIdentityId || session.accountId || session.openUserid);
    }
    const verifiedAnonId = this.anonIds.verify(request.anon_id);
    if (verifiedAnonId) {
      return verifiedAnonId;
    }
    return this.anonIds.issue();
  }

  /**
   * 尝试解析员工会话 token。
   *
   * 公开名片允许匿名访问，因此无 token 或 token 失效都降级为匿名，
   * 不把会话错误暴露给公开页面。
   */
  private optionalSession(token: string | undefined): EmployeeSession | undefined {
    if (!token) {
      return undefined;
    }
    try {
      return this.sessionTokens.verify(token);
    } catch {
      return undefined;
    }
  }

  /**
   * 记录公开名片访问后的互动行为。
   *
   * 行为必须携带当前 publicId 范围内的有效 visit_token；点赞会额外返回更新后的统计，
   * 其他行为只确认幂等写入结果。
   */
  async recordAction(publicId: string, token: string, request: ActionRequest): Promise<ActionResponse> {
    const payload = this.visitTokens.verify(token);
    if (payload.publicId !== publicId) {
      throw new UnauthorizedException("visit_token scope mismatch");
    }
    if (!(await this.repository.findVisit(publicId, payload.visitId))) {
      throw new UnauthorizedException("visit not found");
    }
    const result = await this.repository.recordAction(publicId, payload.visitId, request.action_type);
    const stats = request.action_type === "like_card" ? await this.repository.getStats(publicId) : undefined;
    return actionResponseSchema.parse({
      accepted: true,
      idempotent: result.idempotent,
      stats
    });
  }

  /**
   * 基于一次有效访问派生新的分享链路。
   *
   * 只有允许转发的公开名片才能派生分享；深度上限和截断逻辑由 repository 根据数据规则处理。
   */
  async deriveShare(publicId: string, token: string, request: DeriveShareRequest): Promise<DeriveShareResponse> {
    const payload = this.visitTokens.verify(token);
    if (payload.publicId !== publicId) {
      throw new UnauthorizedException("visit_token scope mismatch");
    }
    if (!(await this.repository.findVisit(publicId, payload.visitId))) {
      throw new UnauthorizedException("visit not found");
    }
    const card = await this.repository.findPublicCard(publicId);
    if (!card.allow_forward) {
      throw new ForbiddenException("card forwarding is disabled");
    }
    const share = await this.repository.deriveShare({
      publicId,
      parentShareId: request.parent_share_id
    });
    return deriveShareResponseSchema.parse({
      share_id: share.shareId,
      parent_share_id: request.parent_share_id,
      depth: share.depth,
      capped: share.capped
    });
  }
}

function hashIp(ipAddress: string | undefined): string | undefined {
  const normalized = ipAddress?.trim();
  if (!normalized) {
    return undefined;
  }
  // 使用带密钥 HMAC 而不是裸哈希：IPv4 空间太小，无盐摘要接近可逆；ip_hash 也属于个人信息。
  return createHmac("sha256", readSecret("VISIT_TOKEN_SECRET")).update(`v1.ip.${normalized}`).digest("hex");
}
