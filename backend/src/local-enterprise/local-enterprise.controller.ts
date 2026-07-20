import { Body, Controller, Get, Param, Post, Req, UseGuards } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { AdminAuthGuard, type AdminRequest } from "../admin-auth/admin-auth.guard.js";
import { requireAdminSession } from "../admin-auth/admin-session.util.js";
import { acceptMemberInvitationSchema, claimLocalEnterpriseSchema, createLocalEnterpriseAdminSessionSchema, createLocalEnterpriseSchema, createMemberInvitationSchema, localAdminScanConfirmSchema, reviewJoinRequestSchema, submitJoinRequestSchema } from "../contracts/local-enterprise.js";
import { EmployeeAuthGuard, type EmployeeRequest } from "../session/employee-auth.guard.js";
import { LocalEnterpriseService } from "./local-enterprise.service.js";

@Controller("local-enterprises")
@UseGuards(EmployeeAuthGuard)
export class LocalEnterpriseController {
  constructor(private readonly service: LocalEnterpriseService) {}
  @Post() @Throttle({ default: { ttl: 60 * 60 * 1000, limit: 5 } }) create(@Req() req: EmployeeRequest, @Body() body: unknown) { const input=createLocalEnterpriseSchema.parse(body); return this.service.create(req.employeeSession!, input.name); }
  @Post("admin-session") @Throttle({ default: { ttl: 15 * 60 * 1000, limit: 10 } }) adminSession(@Req() req: EmployeeRequest, @Body() body: unknown) { const input=createLocalEnterpriseAdminSessionSchema.parse(body); return this.service.createAdminSession(req.employeeSession!, input.tenant_id); }
  @Post("invitations/accept") accept(@Req() req: EmployeeRequest, @Body() body: unknown) { const input=acceptMemberInvitationSchema.parse(body); return this.service.accept(req.employeeSession!, input.invitation_token); }
  @Post("claim") @Throttle({ default: { ttl: 15 * 60 * 1000, limit: 10 } }) claim(@Req() req: EmployeeRequest, @Body() body: unknown) { const input=claimLocalEnterpriseSchema.parse(body); return this.service.claim(req.employeeSession!, input.claim_token, input.display_name); }
  @Post("join-requests") join(@Req() req:EmployeeRequest,@Body() body:unknown){const input=submitJoinRequestSchema.parse(body);return this.service.submitJoinRequest(req.employeeSession!,input.join_token,input.display_name);}
  @Post("admin-scan/confirm") @Throttle({default:{ttl:60_000,limit:20}}) confirmAdminScan(@Req() req:EmployeeRequest,@Body() body:unknown){const input=localAdminScanConfirmSchema.parse(body);return this.service.confirmAdminScan(req.employeeSession!,input.challenge_token,input.tenant_id);}
}

@Controller("admin/auth/local-scan")
export class LocalEnterpriseScanLoginController {
  constructor(private readonly service:LocalEnterpriseService){}
  @Post("challenges") @Throttle({default:{ttl:60_000,limit:10}}) create(){return this.service.createAdminScanChallenge();}
  @Get("challenges/:token") @Throttle({default:{ttl:60_000,limit:60}}) poll(@Param("token") token:string){return this.service.pollAdminScanChallenge(token);}
}

@Controller("admin/local-enterprises")
@UseGuards(AdminAuthGuard)
export class LocalEnterpriseAdminController {
  constructor(private readonly service: LocalEnterpriseService) {}
  @Post("members/invitations") invite(@Req() req: AdminRequest, @Body() body: unknown) { const input=createMemberInvitationSchema.parse(body); return this.service.invite(requireAdminSession(req), input.display_name); }
  @Post("join-code") joinCode(@Req() req:AdminRequest){return this.service.createJoinCode(requireAdminSession(req));}
  @Get("join-requests") joinRequests(@Req() req:AdminRequest){return this.service.listJoinRequests(requireAdminSession(req));}
  @Post("join-requests/:id/review") review(@Req() req:AdminRequest,@Param("id") id:string,@Body() body:unknown){const input=reviewJoinRequestSchema.parse(body);return this.service.reviewJoinRequest(requireAdminSession(req),id,input.decision);}
}
