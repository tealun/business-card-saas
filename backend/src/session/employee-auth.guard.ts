import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import type { EmployeeSession } from "./employee-session.js";
import { SessionTokenService } from "./session-token.service.js";
import { DatabaseService } from "../database/database.service.js";

export interface EmployeeRequest {
  employeeSession?: EmployeeSession;
}

@Injectable()
export class EmployeeAuthGuard implements CanActivate {
  constructor(private readonly sessionTokens: SessionTokenService, private readonly database: DatabaseService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<EmployeeRequest & { headers: { authorization?: string } }>();
    const auth = request.headers.authorization;
    const token = auth?.startsWith("Bearer ") ? auth.slice("Bearer ".length) : undefined;
    if (!token) {
      throw new UnauthorizedException("employee access token required");
    }
    const session=this.sessionTokens.verify(token);
    if(this.database.isConfigured()){
      const active=await this.database.transaction(async(tx)=>{
        await tx.query("SELECT set_config('app.account_id',$1,true)",[session.accountId]);
        await tx.query("SELECT set_config('app.tenant_id',$1,true)",[session.tenantId]);
        return tx.query(`SELECT 1 FROM accounts a
          JOIN account_identity_bindings b ON b.account_id=a.id
          JOIN member_identities m ON m.id=b.member_identity_id AND m.tenant_id=b.tenant_id
          JOIN tenants t ON t.id=b.tenant_id
          WHERE a.id=$1 AND b.tenant_id=$2 AND b.member_identity_id=$3
            AND a.status='active' AND m.status='active' AND t.status='active'`,[session.accountId,session.tenantId,session.memberIdentityId]);
      });
      if(!active.rowCount) throw new UnauthorizedException("employee identity is inactive");
    }
    request.employeeSession = session;
    return true;
  }
}
