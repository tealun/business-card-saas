import { BadRequestException } from "@nestjs/common";
import { WecomAuthorizationCompleteController } from "./wecom-authorization-complete.controller.js";
import type { WecomAuthorizationService } from "./wecom-authorization.service.js";

describe("WecomAuthorizationCompleteController", () => {
  it("exchanges redirect auth_code without returning permanent_code", async () => {
    const authorization = {
      handleAuthCode: jest.fn(async () => ({
        tenantId: "tenant-001",
        openCorpid: "corp-001",
        corpName: "Pilot Corp",
        permanentCode: "perm-secret",
        agentId: "100001",
        authStatus: "active" as const
      }))
    } as unknown as jest.Mocked<WecomAuthorizationService>;
    const controller = new WecomAuthorizationCompleteController(authorization);

    const result = await controller.complete({ auth_code: " auth-code-001 ", state: "state_001" });

    expect(authorization.handleAuthCode).toHaveBeenCalledWith("auth-code-001");
    expect(result).toEqual({
      handled: true,
      tenant_id: "tenant-001",
      open_corpid: "corp-001",
      corp_name: "Pilot Corp",
      auth_status: "active",
      state: "state_001"
    });
    expect(result).not.toHaveProperty("permanentCode");
  });

  it("rejects missing auth_code as a bad request", async () => {
    const authorization = {
      handleAuthCode: jest.fn()
    } as unknown as jest.Mocked<WecomAuthorizationService>;
    const controller = new WecomAuthorizationCompleteController(authorization);

    await expect(controller.complete({ state: "state_001" })).rejects.toThrow(BadRequestException);
    expect(authorization.handleAuthCode).not.toHaveBeenCalled();
  });
});
