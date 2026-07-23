import { ForbiddenException } from "@nestjs/common";
import { AdminMediaUploadController } from "./admin-media-upload.controller.js";

describe("AdminMediaUploadController", () => {
  it("stores an admin image upload into the selected category", async () => {
    const storage = {
      storeImageBuffer: jest.fn(async () => ({
        publicUrl: "/api/v1/storage/tenant/1/company-images/a.png",
        storageKey: "tenant/1/company-images/a.png"
      }))
    };
    const controller = new AdminMediaUploadController(storage as never);

    const result = await controller.uploadImage(
      request("admin") as never,
      Buffer.from("image"),
      "company-images",
      "intro.png"
    );

    expect(storage.storeImageBuffer).toHaveBeenCalledWith({
      tenantId: "1",
      category: "company-images",
      fileName: "intro.png",
      contentType: "image/png",
      buffer: Buffer.from("image")
    });
    expect(result.url).toBe("/api/v1/storage/tenant/1/company-images/a.png");
  });

  it("rejects read-only tenant admins from uploads", async () => {
    const controller = new AdminMediaUploadController({ storeImageBuffer: jest.fn() } as never);

    await expect(controller.uploadImage(
      request("auditor") as never,
      Buffer.from("image"),
      "company-images",
      "intro.png"
    )).rejects.toThrow(ForbiddenException);
  });

  it("rejects video uploads when the tenant video feature is disabled", async () => {
    const controller = new AdminMediaUploadController(
      { storeVideoBuffer: jest.fn() } as never,
      { capability: jest.fn(async () => ({ enabled: false })) } as never
    );

    await expect(controller.uploadVideo(
      request("admin") as never,
      Buffer.from("video"),
      "intro.mp4"
    )).rejects.toThrow(ForbiddenException);
  });

  it("stores a video upload using the tenant video capability limit", async () => {
    const storage = {
      storeVideoBuffer: jest.fn(async () => ({
        publicUrl: "/api/v1/storage/tenant/1/videos/intro.mp4",
        storageKey: "tenant/1/videos/intro.mp4"
      }))
    };
    const controller = new AdminMediaUploadController(
      storage as never,
      { capability: jest.fn(async () => ({ enabled: true, effective_limit_bytes: 100 })) } as never
    );

    const result = await controller.uploadVideo(
      request("admin", "video/mp4") as never,
      Buffer.from("video"),
      "intro.mp4"
    );

    expect(storage.storeVideoBuffer).toHaveBeenCalledWith({
      tenantId: "1",
      category: "videos",
      fileName: "intro.mp4",
      contentType: "video/mp4",
      buffer: Buffer.from("video"),
      maxBytes: 100
    });
    expect(result.url).toBe("/api/v1/storage/tenant/1/videos/intro.mp4");
  });
});

function request(role: "admin" | "auditor", contentType = "image/png") {
  return {
    headers: { "content-type": contentType },
    adminSession: {
      accountType: "tenant",
      tenantId: "1",
      tenantName: "Pilot Corp",
      openUserid: "ou_1",
      memberIdentityId: null,
      role
    }
  };
}
