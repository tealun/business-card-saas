import { UnauthorizedException } from "@nestjs/common";
import type { ExecutionContext } from "@nestjs/common";
import { EmployeeAuthGuard } from "./employee-auth.guard.js";
import { SessionTokenService } from "./session-token.service.js";
import type { EmployeeSession } from "./employee-session.js";

describe("EmployeeAuthGuard", () => {
  const service = new SessionTokenService();
  const database = { isConfigured: jest.fn(() => false), transaction: jest.fn() };
  const guard = new EmployeeAuthGuard(service, database as never);

  const session: EmployeeSession = {
    accountId: "acct-001",
    tenantId: "tenant-001",
    tenantName: "Pilot Corp",
    memberIdentityId: "member-001",
    displayName: "Employee",
    openUserid: "ou-001",
    publicId: "pub_00000001"
  };

  function context(auth?: string): ExecutionContext {
    return {
      switchToHttp: () => ({
        getRequest: () => ({ headers: { authorization: auth } })
      })
    } as ExecutionContext;
  }

  it("allows requests with a valid bearer token", async () => {
    const token = service.sign(session);
    await expect(guard.canActivate(context(`Bearer ${token}`))).resolves.toBe(true);
  });

  it("throws when the authorization header is missing", async () => {
    await expect(guard.canActivate(context())).rejects.toThrow(UnauthorizedException);
  });

  it("throws when the token is malformed", async () => {
    await expect(guard.canActivate(context("Bearer not-a-token"))).rejects.toThrow(UnauthorizedException);
  });

  it("rejects a signed token after its member identity is disabled", async () => {
    database.isConfigured.mockReturnValueOnce(true);
    database.transaction.mockImplementationOnce(async(callback)=>callback({query:jest.fn(async(sql:string)=>({rows:[],rowCount:sql.includes("SELECT 1 FROM accounts")?0:null}))}));
    const token=service.sign(session);
    await expect(guard.canActivate(context(`Bearer ${token}`))).rejects.toThrow("employee identity is inactive");
  });

  it("preserves access for an active bound identity", async () => {
    database.isConfigured.mockReturnValueOnce(true);
    database.transaction.mockImplementationOnce(async(callback)=>callback({query:jest.fn(async(sql:string)=>({rows:sql.includes("SELECT 1 FROM accounts")?[{one:1}]:[],rowCount:sql.includes("SELECT 1 FROM accounts")?1:null}))}));
    const token=service.sign(session);
    await expect(guard.canActivate(context(`Bearer ${token}`))).resolves.toBe(true);
  });
});
