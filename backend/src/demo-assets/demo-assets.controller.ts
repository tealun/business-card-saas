import { Controller, Get, NotFoundException, Param, Res } from "@nestjs/common";
import type { FastifyReply } from "fastify";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";

const DEMO_ASSET_DIR = path.resolve(process.cwd(), "assets");
const DEMO_ASSET_FOLDERS: Record<string, string> = {
  company: "demo-company",
  "card-portraits": "card-portraits"
};

const DEMO_ASSETS: Record<string, Record<string, string>> = {
  company: {
    "service-identity.png": "image/png",
    "service-leads.png": "image/png",
    "service-brand.png": "image/png",
    "service-analytics.png": "image/png",
    "service-integration.png": "image/png",
    "profile-office.png": "image/png",
    "profile-team.png": "image/png",
    "profile-product.png": "image/png",
    "honor-award.png": "image/png",
    "honor-ceremony.png": "image/png",
    "honor-audit.png": "image/png",
    "video-cover.png": "image/png",
    "company-intro.mp4": "video/mp4"
  },
  "card-portraits": {
    "default-avatar-square.png": "image/png"
  }
};

@Controller("demo-assets")
export class DemoAssetsController {
  @Get(":assetGroup/:fileName")
  async readDemoAsset(
    @Param("assetGroup") assetGroup: string,
    @Param("fileName") fileName: string,
    @Res() reply: FastifyReply
  ) {
    const contentType = DEMO_ASSETS[assetGroup]?.[fileName];
    if (!contentType) {
      throw demoAssetNotFound(reply);
    }
    const filePath = path.resolve(DEMO_ASSET_DIR, DEMO_ASSET_FOLDERS[assetGroup] ?? assetGroup, fileName);
    if (!filePath.startsWith(`${DEMO_ASSET_DIR}${path.sep}`)) {
      throw demoAssetNotFound(reply);
    }
    const info = await stat(filePath).catch(() => null);
    if (!info || !info.isFile()) {
      throw demoAssetNotFound(reply);
    }
    reply.header("content-type", contentType);
    reply.header("content-length", String(info.size));
    reply.header("cache-control", "public, max-age=31536000, immutable");
    reply.header("cross-origin-resource-policy", "cross-origin");
    return reply.send(createReadStream(filePath));
  }
}

function demoAssetNotFound(reply: FastifyReply): NotFoundException {
  reply.header("cross-origin-resource-policy", "cross-origin");
  return new NotFoundException("demo asset not found");
}
