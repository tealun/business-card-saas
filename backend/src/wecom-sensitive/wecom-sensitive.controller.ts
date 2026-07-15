import { Body, Controller, Get, Post, Query, Req, Res, UseGuards } from "@nestjs/common";
import type { FastifyReply } from "fastify";
import { EmployeeAuthGuard, type EmployeeRequest } from "../session/employee-auth.guard.js";
import { WecomSensitiveService } from "./wecom-sensitive.service.js";

@Controller("wecom/member-sensitive")
export class WecomSensitiveController {
  constructor(private readonly sensitive: WecomSensitiveService) {}

  @Post("authorization-url")
  @UseGuards(EmployeeAuthGuard)
  createAuthorizationUrl(@Req() request: EmployeeRequest, @Body() _body: unknown) {
    if (!request.employeeSession) throw new Error("employee session missing after guard");
    return this.sensitive.createAuthorizationUrl(request.employeeSession);
  }

  @Get("callback")
  async callback(
    @Query("code") code: string | undefined,
    @Query("state") state: string | undefined,
    @Res() reply: FastifyReply
  ) {
    try {
      if (!code?.trim() || !state?.trim()) throw new Error("authorization was cancelled or incomplete");
      await this.sensitive.complete(code, state);
      return reply.status(200).type("text/html; charset=utf-8").send(resultPage(true));
    } catch {
      return reply.status(400).type("text/html; charset=utf-8").send(resultPage(false));
    }
  }

  @Get("start")
  start(@Query("state") state: string | undefined, @Res() reply: FastifyReply) {
    if (!state || !/^[A-Fa-f0-9]{36}$/.test(state)) {
      return reply.status(400).type("text/html; charset=utf-8").send(resultPage(false));
    }
    return reply.redirect(this.sensitive.createWecomOAuthUrl(state));
  }
}

function resultPage(success: boolean): string {
  const title = success ? "企业信息同步成功" : "企业信息授权未完成";
  const detail = success ? "头像和企业微信二维码已更新，请返回小程序查看。" : "请返回小程序重新发起授权。";
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title></head><body style="font-family:system-ui;padding:48px 24px;text-align:center;color:#1f2937"><h2>${title}</h2><p>${detail}</p></body></html>`;
}
