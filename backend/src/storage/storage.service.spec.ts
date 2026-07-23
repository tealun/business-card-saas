import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { S3Client } from "@aws-sdk/client-s3";
import { AppConfig } from "../config/app-config.js";
import { StorageService } from "./storage.service.js";

describe("StorageService", () => {
  const originalEnv = { ...process.env };
  const originalFetch = global.fetch;
  let tempDir = "";

  afterEach(async () => {
    jest.restoreAllMocks();
    process.env = { ...originalEnv };
    global.fetch = originalFetch;
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true });
      tempDir = "";
    }
  });

  it("stores image data URLs under the configured local root and returns a public URL", async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "bc-storage-"));
    process.env.STORAGE_DRIVER = "local";
    process.env.STORAGE_LOCAL_ROOT = tempDir;
    process.env.STORAGE_PUBLIC_BASE_URL = "https://cdn.example.com/storage";
    const service = new StorageService(new AppConfig());

    const stored = await service.storeImageDataUrl({
      tenantId: "tenant-001",
      category: "avatars",
      dataUrl: "data:image/png;base64,aGVsbG8="
    });

    expect(stored.storageKey).toMatch(/^tenant\/tenant-001\/avatars\/.+\.png$/);
    expect(stored.publicUrl).toMatch(/^https:\/\/cdn\.example\.com\/storage\/tenant\/tenant-001\/avatars\/.+\.png$/);
    const file = await readFile(path.join(tempDir, stored.storageKey));
    expect(file.toString("utf8")).toBe("hello");
  });

  it("stores raw image uploads under the configured local root", async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "bc-storage-"));
    process.env.STORAGE_DRIVER = "local";
    process.env.STORAGE_LOCAL_ROOT = tempDir;
    const service = new StorageService(new AppConfig());

    const stored = await service.storeImageBuffer({
      tenantId: "tenant-001",
      category: "company-images",
      fileName: "cover.webp",
      contentType: "application/octet-stream",
      buffer: Buffer.from("image")
    });

    expect(stored.storageKey).toMatch(/^tenant\/tenant-001\/company-images\/.+\.webp$/);
    const file = await readFile(path.join(tempDir, stored.storageKey));
    expect(file.toString("utf8")).toBe("image");
  });

  it("stores raw video uploads and enforces the effective limit", async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "bc-storage-"));
    process.env.STORAGE_DRIVER = "local";
    process.env.STORAGE_LOCAL_ROOT = tempDir;
    process.env.STORAGE_MAX_VIDEO_UPLOAD_BYTES = "20";
    const service = new StorageService(new AppConfig());

    const stored = await service.storeVideoBuffer({
      tenantId: "tenant-001",
      category: "videos",
      fileName: "intro.mp4",
      contentType: "video/mp4",
      buffer: Buffer.from("video"),
      maxBytes: 10
    });

    expect(stored.storageKey).toMatch(/^tenant\/tenant-001\/videos\/.+\.mp4$/);
    await expect(service.storeVideoBuffer({
      tenantId: "tenant-001",
      category: "videos",
      fileName: "intro.mp4",
      contentType: "video/mp4",
      buffer: Buffer.from("this is too long"),
      maxBytes: 10
    })).rejects.toThrow("uploaded video exceeds configured limit");
  });

  it("serves local objects from the configured storage root", async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "bc-storage-"));
    process.env.STORAGE_DRIVER = "local";
    process.env.STORAGE_LOCAL_ROOT = tempDir;
    const service = new StorageService(new AppConfig());
    const stored = await service.storeImageDataUrl({
      tenantId: "tenant-001",
      category: "avatars",
      dataUrl: "data:image/jpeg;base64,aGVsbG8="
    });
    const fileName = stored.storageKey.split("/").pop()!;

    const object = await service.readLocalObject({ tenantId: "tenant-001", category: "avatars", fileName });

    expect(object.contentType).toBe("image/jpeg");
    expect(object.contentLength).toBe(5);
    object.stream.destroy();
  });

  it("caches trusted WeCom images and rejects arbitrary remote hosts", async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "bc-storage-"));
    process.env.STORAGE_DRIVER = "local";
    process.env.STORAGE_LOCAL_ROOT = tempDir;
    const response = {
      ok: true,
      url: "https://shp.qpic.cn/bizmp/avatar/0",
      headers: new Headers({ "content-type": "image/png", "content-length": "5" }),
      arrayBuffer: async () => Buffer.from("hello")
    };
    global.fetch = jest.fn(async () => response) as unknown as typeof fetch;
    const service = new StorageService(new AppConfig());

    const stored = await service.storeTrustedRemoteImage({
      tenantId: "tenant-001",
      category: "avatars",
      url: "https://shp.qpic.cn/bizmp/avatar/0"
    });

    expect(stored.storageKey).toContain("/avatars/");
    await expect(
      service.storeTrustedRemoteImage({
        tenantId: "tenant-001",
        category: "avatars",
        url: "https://attacker.example/avatar.png"
      })
    ).rejects.toThrow("untrusted WeCom image URL");
  });

  it("returns a portable API path when no separate public storage origin is configured", async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "bc-storage-"));
    process.env.STORAGE_DRIVER = "local";
    process.env.STORAGE_LOCAL_ROOT = tempDir;
    delete process.env.STORAGE_PUBLIC_BASE_URL;
    const service = new StorageService(new AppConfig());

    const stored = await service.storeImageDataUrl({
      tenantId: "tenant-001",
      category: "logos",
      dataUrl: "data:image/png;base64,aGVsbG8="
    });

    expect(stored.publicUrl).toMatch(/^\/api\/v1\/storage\/tenant\/tenant-001\/logos\/.+\.png$/);
  });

  it("stores image data URLs into Alibaba Cloud OSS-compatible storage", async () => {
    process.env.STORAGE_DRIVER = "aliyun_oss";
    process.env.ALIYUN_OSS_BUCKET = "bc-bucket";
    process.env.ALIYUN_OSS_REGION = "oss-cn-hangzhou";
    process.env.ALIYUN_OSS_ENDPOINT = "https://oss-cn-hangzhou.aliyuncs.com";
    process.env.ALIYUN_OSS_ACCESS_KEY_ID = "oss-key";
    process.env.ALIYUN_OSS_ACCESS_KEY_SECRET = "oss-secret";
    delete process.env.STORAGE_PUBLIC_BASE_URL;
    const send = jest.spyOn(S3Client.prototype, "send").mockResolvedValue({} as never);
    const service = new StorageService(new AppConfig());

    const stored = await service.storeImageDataUrl({
      tenantId: "tenant-001",
      category: "logos",
      dataUrl: "data:image/png;base64,aGVsbG8="
    });

    expect(send).toHaveBeenCalledTimes(1);
    expect(stored.storageKey).toMatch(/^tenant\/tenant-001\/logos\/.+\.png$/);
    expect(stored.publicUrl).toMatch(/^\/api\/v1\/storage\/tenant\/tenant-001\/logos\/.+\.png$/);
  });

  it("reads remote objects from S3-compatible storage", async () => {
    process.env.STORAGE_DRIVER = "s3";
    process.env.S3_BUCKET = "bc-bucket";
    process.env.S3_REGION = "ap-southeast-1";
    process.env.S3_ENDPOINT = "https://s3.example.com";
    process.env.S3_ACCESS_KEY_ID = "s3-key";
    process.env.S3_SECRET_ACCESS_KEY = "s3-secret";
    process.env.S3_FORCE_PATH_STYLE = "true";
    const send = jest.spyOn(S3Client.prototype, "send").mockResolvedValueOnce({
      Body: Readable.from([Buffer.from("hello")]),
      ContentType: "image/jpeg",
      ContentLength: 5
    } as never);
    const service = new StorageService(new AppConfig());

    const object = await service.readLocalObject({
      tenantId: "tenant-001",
      category: "avatars",
      fileName: "avatar.jpg"
    });
    const chunks: Buffer[] = [];
    for await (const chunk of object.stream) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }

    expect(send).toHaveBeenCalledTimes(1);
    expect(Buffer.concat(chunks).toString("utf8")).toBe("hello");
    expect(object.contentType).toBe("image/jpeg");
    expect(object.contentLength).toBe(5);
  });
});
