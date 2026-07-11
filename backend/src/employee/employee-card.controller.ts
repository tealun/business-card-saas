import { Body, Controller, Get, Post, Put, Req, UseGuards } from "@nestjs/common";
import { updateEmployeeCardRequestSchema, updateEmployeeCardStyleRequestSchema } from "../contracts/employee-card.js";
import { EmployeeAuthGuard, type EmployeeRequest } from "../session/employee-auth.guard.js";
import { EmployeeCardService } from "./employee-card.service.js";

@Controller("employee/cards")
@UseGuards(EmployeeAuthGuard)
export class EmployeeCardController {
  constructor(private readonly cards: EmployeeCardService) {}

  @Get("current")
  async getCurrent(@Req() request: EmployeeRequest) {
    return this.cards.getCurrentCard(this.requireSession(request));
  }

  @Put("current")
  async updateCurrent(@Req() request: EmployeeRequest, @Body() body: unknown) {
    return this.cards.updateCurrentCard(this.requireSession(request), updateEmployeeCardRequestSchema.parse(body));
  }

  @Get("current/preview")
  async getPreview(@Req() request: EmployeeRequest) {
    return this.cards.getPreview(this.requireSession(request));
  }

  @Get("current/stats")
  async getStats(@Req() request: EmployeeRequest) {
    return this.cards.getCurrentCardStats(this.requireSession(request));
  }

  @Put("current/style")
  async updateStyle(@Req() request: EmployeeRequest, @Body() body: unknown) {
    return this.cards.updateStyle(this.requireSession(request), updateEmployeeCardStyleRequestSchema.parse(body));
  }

  @Post("current/share")
  async createShare(@Req() request: EmployeeRequest) {
    return this.cards.createShare(this.requireSession(request));
  }

  private requireSession(request: EmployeeRequest) {
    if (!request.employeeSession) {
      throw new Error("employee session missing after guard");
    }
    return request.employeeSession;
  }
}
