import { Body, Controller, Get, Post, Put, Req, UseGuards } from "@nestjs/common";
import { updateEmployeeCardRequestSchema, updateEmployeeCardStyleRequestSchema, updateWechatQrCodeRequestSchema } from "../contracts/employee-card.js";
import { EmployeeAuthGuard, type EmployeeRequest } from "../session/employee-auth.guard.js";
import { EmployeeCardService } from "./employee-card.service.js";

@Controller("employee/cards")
@UseGuards(EmployeeAuthGuard)
export class EmployeeCardController {
  constructor(private readonly cards: EmployeeCardService) {}

  /**
   * 读取当前员工名片。
   */
  @Get("current")
  async getCurrent(@Req() request: EmployeeRequest) {
    return this.cards.getCurrentCard(this.requireSession(request));
  }

  /**
   * 更新当前员工名片资料。
   */
  @Put("current")
  async updateCurrent(@Req() request: EmployeeRequest, @Body() body: unknown) {
    return this.cards.updateCurrentCard(this.requireSession(request), updateEmployeeCardRequestSchema.parse(body));
  }

  /**
   * 读取当前名片公开预览。
   */
  @Get("current/preview")
  async getPreview(@Req() request: EmployeeRequest) {
    return this.cards.getPreview(this.requireSession(request));
  }

  /**
   * 读取当前名片统计。
   */
  @Get("current/stats")
  async getStats(@Req() request: EmployeeRequest) {
    return this.cards.getCurrentCardStats(this.requireSession(request));
  }

  /**
   * 更新当前名片样式。
   */
  @Put("current/style")
  async updateStyle(@Req() request: EmployeeRequest, @Body() body: unknown) {
    return this.cards.updateStyle(this.requireSession(request), updateEmployeeCardStyleRequestSchema.parse(body));
  }

  /**
   * 读取当前名片微信二维码。
   */
  @Get("current/wechat-qrcode")
  async getWechatQrCode(@Req() request: EmployeeRequest) {
    return this.cards.getWechatQrCode(this.requireSession(request));
  }

  /**
   * 更新当前名片微信二维码。
   */
  @Put("current/wechat-qrcode")
  async updateWechatQrCode(@Req() request: EmployeeRequest, @Body() body: unknown) {
    return this.cards.updateWechatQrCode(this.requireSession(request), updateWechatQrCodeRequestSchema.parse(body));
  }

  /**
   * 创建当前名片分享。
   */
  @Post("current/share")
  async createShare(@Req() request: EmployeeRequest) {
    return this.cards.createShare(this.requireSession(request));
  }

  /**
   * 读取 EmployeeAuthGuard 注入的员工会话。
   */
  private requireSession(request: EmployeeRequest) {
    if (!request.employeeSession) {
      throw new Error("employee session missing after guard");
    }
    return request.employeeSession;
  }
}
