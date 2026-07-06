import { Injectable } from "@nestjs/common";
import {
  employeeCardResponseSchema,
  employeeShareResponseSchema,
  updateEmployeeCardStyleRequestSchema,
  updateEmployeeCardRequestSchema,
  type EmployeeCardPreviewResponse,
  type EmployeeCardResponse,
  type EmployeeShareResponse,
  type UpdateEmployeeCardStyleRequest,
  type UpdateEmployeeCardRequest
} from "../contracts/employee-card.js";
import { publicCardResponseSchema } from "../contracts/public-card.js";
import type { EmployeeSession } from "../session/employee-session.js";
import { EmployeeCardRepository } from "./employee-card.repository.js";

@Injectable()
export class EmployeeCardService {
  constructor(private readonly repository: EmployeeCardRepository) {}

  getCurrentCard(session: EmployeeSession): EmployeeCardResponse {
    return employeeCardResponseSchema.parse(this.repository.getCurrentCard(session));
  }

  updateCurrentCard(session: EmployeeSession, request: UpdateEmployeeCardRequest): EmployeeCardResponse {
    const parsed = updateEmployeeCardRequestSchema.parse(request);
    return employeeCardResponseSchema.parse(this.repository.updateCurrentCard(session, parsed));
  }

  getPreview(session: EmployeeSession): EmployeeCardPreviewResponse {
    return publicCardResponseSchema.parse(this.repository.getPreview(session));
  }

  updateStyle(session: EmployeeSession, request: UpdateEmployeeCardStyleRequest): EmployeeCardPreviewResponse {
    const parsed = updateEmployeeCardStyleRequestSchema.parse(request);
    return publicCardResponseSchema.parse(this.repository.updateStyle(session, parsed));
  }

  createShare(session: EmployeeSession): EmployeeShareResponse {
    const share = this.repository.createShare(session);
    return employeeShareResponseSchema.parse({
      public_id: share.publicId,
      share_id: share.shareId,
      scene: share.shareId,
      path: `/pages/public/card?card=${share.publicId}&share=${share.shareId}`
    });
  }
}
