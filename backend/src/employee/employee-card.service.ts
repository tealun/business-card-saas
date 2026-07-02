import { Injectable } from "@nestjs/common";
import {
  employeeCardResponseSchema,
  employeeShareResponseSchema,
  type EmployeeCardResponse,
  type EmployeeShareResponse
} from "../contracts/employee-card.js";
import type { EmployeeSession } from "../session/employee-session.js";
import { EmployeeCardRepository } from "./employee-card.repository.js";

@Injectable()
export class EmployeeCardService {
  constructor(private readonly repository: EmployeeCardRepository) {}

  getCurrentCard(session: EmployeeSession): EmployeeCardResponse {
    return employeeCardResponseSchema.parse(this.repository.getCurrentCard(session));
  }

  createShare(session: EmployeeSession): EmployeeShareResponse {
    const share = this.repository.createShare(session);
    return employeeShareResponseSchema.parse({
      public_id: share.publicId,
      share_id: share.shareId,
      scene: share.shareId,
      path: `/pages/card/detail?card=${share.publicId}&share=${share.shareId}`
    });
  }
}
