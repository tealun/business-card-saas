import { Body, Controller, Get, Post, Query, Req, Res, UseGuards } from "@nestjs/common";
import type { FastifyReply } from "fastify";
import { EmployeeAuthGuard, type EmployeeRequest } from "../session/employee-auth.guard.js";
import { WecomSensitiveService } from "./wecom-sensitive.service.js";

@Controller("wecom/member-sensitive")
export class WecomSensitiveController {
  constructor(private readonly sensitive: WecomSensitiveService) {}

  /**
   * 创建企业微信敏感资料授权入口。
   */
  @Post("authorization-url")
  @UseGuards(EmployeeAuthGuard)
  createAuthorizationUrl(@Req() request: EmployeeRequest, @Body() _body: unknown) {
    if (!request.employeeSession) throw new Error("employee session missing after guard");
    return this.sensitive.createAuthorizationUrl(request.employeeSession);
  }

  /**
   * 读取当前名片敏感资料授权状态。
   */
  @Get("status")
  @UseGuards(EmployeeAuthGuard)
  getStatus(@Req() request: EmployeeRequest) {
    if (!request.employeeSession) throw new Error("employee session missing after guard");
    return this.sensitive.getStatus(request.employeeSession);
  }

  /**
   * 企业微信 OAuth 回调。
   *
   * 成功或失败都返回一个简短 HTML 页面，提示用户回到小程序继续。
   */
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

  /**
   * 企业微信 OAuth 起跳页。
   *
   * 先校验 state 格式，再重定向到企业微信授权地址，避免直接暴露未校验参数。
   */
  @Get("start")
  start(@Query("state") state: string | undefined, @Res() reply: FastifyReply) {
    if (!state || !/^[A-Fa-f0-9]{36}$/.test(state)) {
      return reply.status(400).type("text/html; charset=utf-8").send(resultPage(false));
    }
    return reply.redirect(this.sensitive.createWecomOAuthUrl(state));
  }
}

/**
 * 生成授权结果页面。
 */
function resultPage(success: boolean): string {
  const title = success ? "企业信息同步成功" : "企业信息授权未完成";
  const detail = success ? "企业微信资料已同步，请返回小程序查看。" : "请返回小程序重新发起授权。";
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title></head><body style="font-family:system-ui;padding:48px 24px;text-align:center;color:#1f2937"><h2>${title}</h2><p>${detail}</p></body></html>`;
}
