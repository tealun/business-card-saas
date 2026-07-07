import { CanActivate } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import type { UpdateEmployeeCardRequest, UpdateEmployeeCardStyleRequest } from "../contracts/employee-card.js";
import type { EmployeeSession } from "../session/employee-session.js";
import { EmployeeCardController } from "./employee-card.controller.js";
import { EmployeeCardService } from "./employee-card.service.js";

const employeeSession: EmployeeSession = {
  accountId: "acct-001",
  tenantId: "tenant-001",
  tenantName: "Pilot Corp",
  memberIdentityId: "member-001",
  displayName: "Employee",
  openUserid: "ou-001",
  publicId: "pub_00000001"
};

class FakeAuthGuard implements CanActivate {
  canActivate() {
    return true;
  }
}

describe("EmployeeCardController", () => {
  async function createController() {
    const moduleRef = await Test.createTestingModule({
      controllers: [EmployeeCardController],
      providers: [
        {
          provide: EmployeeCardService,
          useValue: {
            getCurrentCard: async () => ({ public_id: employeeSession.publicId }),
            updateCurrentCard: async (_session: EmployeeSession, request: UpdateEmployeeCardRequest) => ({ public_id: employeeSession.publicId, ...request }),
            getPreview: async () => ({ public_id: employeeSession.publicId }),
            updateStyle: async (_session: EmployeeSession, request: UpdateEmployeeCardStyleRequest) => ({ ...request }),
            createShare: async () => ({ public_id: employeeSession.publicId, share_id: "shr_001", scene: "scene_001", path: "/pages/public/card" })
          }
        }
      ]
    })
      .overrideGuard((await import("../session/employee-auth.guard.js")).EmployeeAuthGuard)
      .useClass(FakeAuthGuard)
      .compile();

    return { controller: moduleRef.get(EmployeeCardController), moduleRef };
  }

  it("gets the current card", async () => {
    const { controller } = await createController();
    await expect(controller.getCurrent({ employeeSession } as never)).resolves.toEqual({ public_id: employeeSession.publicId });
  });

  it("updates the current card", async () => {
    const { controller } = await createController();
    await expect(controller.updateCurrent({ employeeSession } as never, { display_name: "Updated" })).resolves.toMatchObject({
      display_name: "Updated",
      public_id: employeeSession.publicId
    });
  });

  it("creates a share", async () => {
    const { controller } = await createController();
    await expect(controller.createShare({ employeeSession } as never)).resolves.toMatchObject({
      share_id: "shr_001",
      path: "/pages/public/card"
    });
  });
});
