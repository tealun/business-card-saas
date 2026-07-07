import { Body, Controller, Get, Post, Query, Res } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import type { FastifyReply } from "fastify";
import { WecomDataCallbackService } from "./wecom-data-callback.service.js";

@Controller("wecom/callbacks/data")
@Throttle({ callback: { ttl: 60_000, limit: 30 } })
export class WecomDataCallbackController {
  constructor(private readonly callbacks: WecomDataCallbackService) {}

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
