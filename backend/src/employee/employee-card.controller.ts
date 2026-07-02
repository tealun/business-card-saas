import { Controller, Get, Post, Req, UseGuards } from "@nestjs/common";
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
