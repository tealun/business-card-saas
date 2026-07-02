import { Injectable, NotFoundException } from "@nestjs/common";
import type { EmployeeCardResponse } from "../contracts/employee-card.js";
import type { EmployeeSession } from "../session/employee-session.js";
import { randomToken } from "../common/id.js";

@Injectable()
export class EmployeeCardRepository {
  getCurrentCard(session: EmployeeSession): EmployeeCardResponse {
    if (session.tenantId !== "1" || session.memberIdentityId !== "1") {
      throw new NotFoundException("current card not found");
    }

    return {
      card_id: "1",
      public_id: "pub_demo0001",
      display_name: "M1 Demo Employee",
      title: "Sales Consultant",
      company: "Demo Tenant",
      avatar_url: null,
      fields: {
        mobile: "13800000000",
        email: "demo@example.com",
        wechat_id: "demo_wechat"
      },
      status: "active",
      privacy: {
        show_mobile: false,
        show_email: true,
        show_wechat: false
      }
    };
  }

  createShare(session: EmployeeSession): { publicId: string; shareId: string } {
    const card = this.getCurrentCard(session);
    return {
      publicId: card.public_id,
      shareId: randomToken("shr", 18)
    };
  }
}
