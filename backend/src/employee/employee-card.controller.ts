import { Body, Controller, Get, Post, Put, Req, UseGuards } from "@nestjs/common";
import { updateEmployeeCardRequestSchema } from "../contracts/employee-card.js";
import { EmployeeAuthGuard, type EmployeeRequest } from "../session/employee-auth.guard.js";
import { EmployeeCardService } from "./employee-card.service.js";

@Controller("employee/cards")
@UseGuards(EmployeeAuthGuard)
export class EmployeeCardController {
  constructor(private readonly cards: EmployeeCardService) {}

  @Get("current")
  getCurrent(@Req() request: EmployeeRequest) {
    return this.cards.getCurrentCard(this.requireSession(request));
  }

  @Put("current")
  updateCurrent(@Req() request: EmployeeRequest, @Body() body: unknown) {
    return this.cards.updateCurrentCard(this.requireSession(request), updateEmployeeCardRequestSchema.parse(body));
  }

  @Post("current/share")
  createShare(@Req() request: EmployeeRequest) {
    return this.cards.createShare(this.requireSession(request));
  }

  private requireSession(request: EmployeeRequest) {
    if (!request.employeeSession) {
      throw new Error("employee session missing after guard");
    }
    return request.employeeSession;
  }
}
