import { Controller, Get, NotFoundException, Param, Res } from "@nestjs/common";
import type { FastifyReply } from "fastify";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";

const DEMO_ASSET_DIR = path.resolve(process.cwd(), "assets/demo-company");

const DEMO_ASSETS: Record<string, string> = {
  "service-identity.png": "image/png",
  "service-leads.png": "image/png",
  "service-brand.png": "image/png",
  "profile-office.png": "image/png",
  "honor-award.png": "image/png",
  "video-cover.png": "image/png",
  "company-intro.mp4": "video/mp4"
};

@Controller("demo-assets/company")
export class DemoAssetsController {
  @Get(":fileName")
  async readDemoCompanyAsset(@Param("fileName") fileName: string, @Res() reply: FastifyReply) {
    const contentType = DEMO_ASSETS[fileName];
    if (!contentType) {
      throw new NotFoundException("demo asset not found");
    }
    const filePath = path.resolve(DEMO_ASSET_DIR, fileName);
    if (!filePath.startsWith(`${DEMO_ASSET_DIR}${path.sep}`)) {
      throw new NotFoundException("demo asset not found");
    }
    const info = await stat(filePath).catch(() => null);
    if (!info || !info.isFile()) {
      throw new NotFoundException("demo asset not found");
    }
    reply.header("content-type", contentType);
    reply.header("content-length", String(info.size));
    reply.header("cache-control", "public, max-age=31536000, immutable");
    reply.header("cross-origin-resource-policy", "cross-origin");
    return reply.send(createReadStream(filePath));
  }
}
