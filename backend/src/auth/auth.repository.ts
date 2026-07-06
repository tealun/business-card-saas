import { Injectable, ServiceUnavailableException, UnauthorizedException } from "@nestjs/common";
import type { IdentitySummary } from "../contracts/auth.js";
import type { EmployeeSession } from "../session/employee-session.js";

export interface DemoIdentity {
  accountId: string;
  tenantId: string;
  tenantName: string;
  memberIdentityId: string;
  displayName: string;
  openUserid: string;
  publicId: string;
}

@Injectable()
export class AuthRepository {
  private static readonly demoCode = "demo-qy-code";

  private readonly demoIdentity: DemoIdentity = {
    accountId: "1",
    tenantId: "1",
    tenantName: "Demo Tenant",
    memberIdentityId: "1",
    displayName: "M1 Demo Employee",
    openUserid: "ou_demo0001",
    publicId: "pub_demo0001"
  };

  resolveQyCode(code: string): DemoIdentity {
    const normalizedCode = code.trim();
    if (!this.demoAuthEnabled()) {
      throw new ServiceUnavailableException("WeCom qy-login is not configured");
    }
    if (normalizedCode !== AuthRepository.demoCode) {
      throw new UnauthorizedException("invalid demo qy login code");
    }
    return this.demoIdentity;
  }

  private demoAuthEnabled(): boolean {
    return process.env.NODE_ENV !== "production" && process.env.DEMO_AUTH_ENABLED === "1";
  }

  toSession(identity: DemoIdentity): EmployeeSession {
    return {
      accountId: identity.accountId,
      tenantId: identity.tenantId,
      memberIdentityId: identity.memberIdentityId,
      openUserid: identity.openUserid
    };
  }

  toSummary(identity: DemoIdentity): IdentitySummary {
    return {
      tenant_id: identity.tenantId,
      tenant_name: identity.tenantName,
      member_identity_id: identity.memberIdentityId,
      display_name: identity.displayName,
      open_userid: identity.openUserid,
      public_id: identity.publicId
    };
  }
}
