import { Controller, Get, Param, Res } from "@nestjs/common";
import type { FastifyReply } from "fastify";
import { StorageService } from "./storage.service.js";

@Controller()
export class StorageController {
  constructor(private readonly storage: StorageService) {}

  @Get("storage/tenant/:tenantId/:category/:fileName")
  async readObject(
    @Param("tenantId") tenantId: string,
    @Param("category") category: string,
    @Param("fileName") fileName: string,
    @Res() reply: FastifyReply
  ) {
    const object = await this.storage.readLocalObject({ tenantId, category, fileName });
    reply.header("content-type", object.contentType);
    reply.header("content-length", String(object.contentLength));
    reply.header("cache-control", "public, max-age=31536000, immutable");
    // Mini Program images are fetched by an isolated rendering origin. Helmet's
    // default `same-origin` CORP header blocks otherwise valid public images.
    reply.header("cross-origin-resource-policy", "cross-origin");
    return reply.send(object.stream);
  }
}
