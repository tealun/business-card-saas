import { Body, Controller, Get, Param, Post, Req, UseGuards } from "@nestjs/common";
import { z } from "zod";
import { createExchangeRequestSchema, subscribeExchangeNotificationSchema } from "../contracts/card-exchange.js";
import { EmployeeAuthGuard, type EmployeeRequest } from "../session/employee-auth.guard.js";
import { CardExchangeService } from "./card-exchange.service.js";

@Controller("employee/card-exchanges")
@UseGuards(EmployeeAuthGuard)
export class CardExchangeController {
  constructor(private readonly exchanges: CardExchangeService) {}

  @Post()
  create(@Req() request: EmployeeRequest, @Body() body: unknown) {
    return this.exchanges.create(this.session(request), createExchangeRequestSchema.parse(body));
  }

  @Get()
  list(@Req() request: EmployeeRequest) {
    return this.exchanges.list(this.session(request));
  }

  @Post("read")
  markRead(@Req() request: EmployeeRequest) {
    return this.exchanges.markIncomingRead(this.session(request));
  }

  @Post(":requestId/accept")
  accept(@Req() request: EmployeeRequest, @Param("requestId") requestId: string) {
    return this.exchanges.respond(this.session(request), z.string().min(1).parse(requestId), "accepted");
  }

  @Post(":requestId/ignore")
  ignore(@Req() request: EmployeeRequest, @Param("requestId") requestId: string) {
    return this.exchanges.respond(this.session(request), z.string().min(1).parse(requestId), "ignored");
  }

  @Post(":requestId/withdraw")
  withdraw(@Req() request: EmployeeRequest, @Param("requestId") requestId: string) {
    return this.exchanges.withdraw(this.session(request), z.string().min(1).parse(requestId));
  }

  @Post("notifications/subscribe")
  subscribe(@Req() request: EmployeeRequest, @Body() body: unknown) {
    const parsed = subscribeExchangeNotificationSchema.parse(body);
    return this.exchanges.subscribeNotification(this.session(request), parsed.event_type, parsed.template_id);
  }

  private session(request: EmployeeRequest) {
    if (!request.employeeSession) throw new Error("employee session missing after guard");
    return request.employeeSession;
  }
}
