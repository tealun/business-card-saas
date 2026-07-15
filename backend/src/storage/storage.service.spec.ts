import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { AppConfig } from "../config/app-config.js";
import { StorageService } from "./storage.service.js";

describe("StorageService", () => {
  const originalEnv = { ...process.env };
  const originalFetch = global.fetch;
  let tempDir = "";

  afterEach(async () => {
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
});
