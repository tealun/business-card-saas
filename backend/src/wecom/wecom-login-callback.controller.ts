import { Body, Controller, Get, Post, Query, Res } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import type { FastifyReply } from "fastify";
import { WecomLoginCallbackService } from "./wecom-login-callback.service.js";

@Controller("wecom/callbacks/login")
@Throttle({ default: { ttl: 60_000, limit: 30 } })
export class WecomLoginCallbackController {
  constructor(private readonly callbacks: WecomLoginCallbackService) {}

  @Get()
  verifyUrl(
    @Query("msg_signature") msgSignature: string | undefined,
    @Query("timestamp") timestamp: string | undefined,
    @Query("nonce") nonce: string | undefined,
    @Query("echostr") echoStr: string | undefined,
    @Res() reply: FastifyReply
  ) {
    const echo = this.callbacks.verifyUrl({ msgSignature, timestamp, nonce }, echoStr);
    return reply.status(200).type("text/plain").send(echo);
  }

  @Post()
  async receive(
    @Query("msg_signature") msgSignature: string | undefined,
    @Query("timestamp") timestamp: string | undefined,
    @Query("nonce") nonce: string | undefined,
    @Body() body: unknown,
    @Res() reply: FastifyReply
  ) {
    await this.callbacks.receive({ msgSignature, timestamp, nonce }, body);
    return reply.status(200).type("text/plain").send("success");
  }
}
