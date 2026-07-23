import { BadRequestException, Body, Controller, ForbiddenException, Optional, Post, Query, Req, UseGuards } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import type { FastifyRequest } from "fastify";
import { z } from "zod";
import { AdminAuthGuard, type AdminRequest } from "../admin-auth/admin-auth.guard.js";
import { requireTenantAdminRole } from "../admin-auth/admin-rbac.js";
import { requireAdminSession } from "../admin-auth/admin-session.util.js";
import { AdminOperationLogService } from "../admin-operation-log/admin-operation-log.service.js";
import { CompanyVideoFeatureService } from "../company-video-feature/company-video-feature.service.js";
import { StorageService, type StorageCategory } from "../storage/storage.service.js";

const imageCategorySchema = z.enum(["logos", "card-backgrounds", "company-images", "honors", "templates"]);

@Controller("admin/uploads")
@UseGuards(AdminAuthGuard)
export class AdminMediaUploadController {
  constructor(
    private readonly storage: StorageService,
    @Optional() private readonly videoFeatures?: CompanyVideoFeatureService,
    @Optional() private readonly operationLogs?: AdminOperationLogService
  ) {}

  @Post("images")
  @Throttle({ default: { ttl: 60_000, limit: 60 } })
  async uploadImage(
    @Req() request: AdminRequest & FastifyRequest,
    @Body() body: unknown,
    @Query("category") category = "company-images",
    @Query("file_name") fileName = "image"
  ) {
    const session = requireAdminSession(request);
    requireTenantAdminRole(session, "admin");
    const stored = await this.storage.storeImageBuffer({
      tenantId: session.tenantId,
      category: imageCategorySchema.parse(category) as StorageCategory,
      fileName,
      contentType: requestContentType(request),
      buffer: requireBufferBody(body)
    });
    await this.operationLogs?.record({
      session,
      action: "media.image.upload",
      detail: { category, storage_key: stored.storageKey }
    });
    return {
      tenant_id: session.tenantId,
      category,
      url: stored.publicUrl,
      storage_key: stored.storageKey
    };
  }

  @Post("videos")
  @Throttle({ default: { ttl: 60_000, limit: 20 } })
  async uploadVideo(
    @Req() request: AdminRequest & FastifyRequest,
    @Body() body: unknown,
    @Query("file_name") fileName = "video"
  ) {
    const session = requireAdminSession(request);
    requireTenantAdminRole(session, "admin");
    const capability = await this.videoFeatures?.capability(session.tenantId);
    if (!capability?.enabled) {
      throw new ForbiddenException("company video feature is not enabled");
    }
    const stored = await this.storage.storeVideoBuffer({
      tenantId: session.tenantId,
      category: "videos",
      fileName,
      contentType: requestContentType(request),
      buffer: requireBufferBody(body),
      maxBytes: capability.effective_limit_bytes
    });
    await this.operationLogs?.record({
      session,
      action: "media.video.upload",
      detail: { storage_key: stored.storageKey }
    });
    return {
      tenant_id: session.tenantId,
      category: "videos",
      url: stored.publicUrl,
      storage_key: stored.storageKey
    };
  }
}

function requestContentType(request: FastifyRequest): string {
  const value = request.headers["content-type"];
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function requireBufferBody(body: unknown): Buffer {
  if (Buffer.isBuffer(body) && body.length > 0) {
    return body;
  }
  throw new BadRequestException("upload body must be a non-empty binary file");
}
