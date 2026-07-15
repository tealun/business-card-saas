import { BadRequestException, Injectable, NotImplementedException, NotFoundException } from "@nestjs/common";
import { createReadStream, type ReadStream } from "node:fs";
import { mkdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { AppConfig } from "../config/app-config.js";

type StorageCategory = "avatars" | "logos" | "card-backgrounds" | "wechat-qrcodes" | "company-images" | "videos" | "honors" | "templates";

interface StoredObject {
  publicUrl: string;
  storageKey: string;
}

interface LocalObject {
  stream: ReadStream;
  contentType: string;
  contentLength: number;
}

const MIME_EXTENSIONS: Record<string, { ext: string; contentType: string }> = {
  "image/jpeg": { ext: "jpg", contentType: "image/jpeg" },
  "image/jpg": { ext: "jpg", contentType: "image/jpeg" },
  "image/png": { ext: "png", contentType: "image/png" },
  "image/webp": { ext: "webp", contentType: "image/webp" }
};

@Injectable()
export class StorageService {
  constructor(private readonly config: AppConfig) {}

  async storeImageDataUrl(input: { tenantId: string; category: StorageCategory; dataUrl: string }): Promise<StoredObject> {
    const parsed = parseImageDataUrl(input.dataUrl);
    if (parsed.buffer.length > this.config.storageMaxUploadBytes) {
      throw new BadRequestException("uploaded image exceeds STORAGE_MAX_UPLOAD_BYTES");
    }
    if (this.config.storageDriver === "aliyun_oss") {
      throw new NotImplementedException("Alibaba Cloud OSS storage is configured but its upload adapter is not installed yet");
    }
    if (this.config.storageDriver === "s3") {
      throw new NotImplementedException("S3-compatible storage is configured but its upload adapter is not installed yet");
    }

    const fileName = `${Date.now()}-${randomUUID()}.${parsed.ext}`;
    const storageKey = `tenant/${safeSegment(input.tenantId)}/${safeSegment(input.category)}/${fileName}`;
    const absolutePath = this.resolveLocalKey(storageKey);
    await mkdir(path.dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, parsed.buffer);
    return {
      storageKey,
      publicUrl: `${this.config.storagePublicBaseUrl}/${storageKey}`
    };
  }

  async storeTrustedRemoteImage(input: {
    tenantId: string;
    category: "avatars" | "wechat-qrcodes";
    url: string;
  }): Promise<StoredObject> {
    assertTrustedWecomImageUrl(input.url);
    const response = await fetch(input.url, { signal: AbortSignal.timeout(8_000) });
    if (!response.ok) throw new BadRequestException("WeCom image download failed");
    assertTrustedWecomImageUrl(response.url);
    const contentType = response.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() ?? "";
    const format = MIME_EXTENSIONS[contentType];
    if (!format) throw new BadRequestException("WeCom returned an unsupported image type");
    const declaredLength = Number(response.headers.get("content-length") ?? 0);
    if (declaredLength > this.config.storageMaxUploadBytes) {
      throw new BadRequestException("WeCom image exceeds STORAGE_MAX_UPLOAD_BYTES");
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length > this.config.storageMaxUploadBytes) {
      throw new BadRequestException("WeCom image exceeds STORAGE_MAX_UPLOAD_BYTES");
    }
    return this.storeImageDataUrl({
      tenantId: input.tenantId,
      category: input.category,
      dataUrl: `data:${format.contentType};base64,${buffer.toString("base64")}`
    });
  }

  async readLocalObject(input: { tenantId: string; category: string; fileName: string }): Promise<LocalObject> {
    if (this.config.storageDriver !== "local") {
      throw new NotFoundException("local storage is not enabled");
    }
    const storageKey = `tenant/${safeSegment(input.tenantId)}/${safeSegment(input.category)}/${safeSegment(input.fileName)}`;
    const absolutePath = this.resolveLocalKey(storageKey);
    const info = await stat(absolutePath).catch(() => null);
    if (!info || !info.isFile()) {
      throw new NotFoundException("stored object not found");
    }
    return {
      stream: createReadStream(absolutePath),
      contentType: contentTypeForFile(input.fileName),
      contentLength: info.size
    };
  }

  private resolveLocalKey(storageKey: string): string {
    const target = path.resolve(this.config.storageLocalRoot, storageKey);
    const root = path.resolve(this.config.storageLocalRoot);
    if (target !== root && !target.startsWith(`${root}${path.sep}`)) {
      throw new BadRequestException("invalid storage key");
    }
    return target;
  }
}

function parseImageDataUrl(dataUrl: string): { buffer: Buffer; ext: string; contentType: string } {
  const match = /^data:(image\/(?:png|jpe?g|webp));base64,([A-Za-z0-9+/=\r\n]+)$/i.exec(dataUrl);
  if (!match) {
    throw new BadRequestException("invalid image data URL");
  }
  const contentType = match[1]!.toLowerCase();
  const format = MIME_EXTENSIONS[contentType];
  if (!format) {
    throw new BadRequestException("unsupported image type");
  }
  return {
    buffer: Buffer.from(match[2]!.replace(/\s/g, ""), "base64"),
    ext: format.ext,
    contentType: format.contentType
  };
}

function safeSegment(value: string): string {
  const segment = String(value || "").trim();
  if (!/^[A-Za-z0-9_.-]+$/.test(segment)) {
    throw new BadRequestException("invalid storage path segment");
  }
  return segment;
}

function contentTypeForFile(fileName: string): string {
  const ext = path.extname(fileName).toLowerCase();
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".png") return "image/png";
  if (ext === ".webp") return "image/webp";
  if (ext === ".mp4") return "video/mp4";
  return "application/octet-stream";
}

function assertTrustedWecomImageUrl(value: string): void {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new BadRequestException("invalid WeCom image URL");
  }
  const hostname = url.hostname.toLowerCase();
  const trusted = ["qpic.cn", "weixin.qq.com", "weixin.work", "work.weixin.qq.com"].some(
    (suffix) => hostname === suffix || hostname.endsWith(`.${suffix}`)
  );
  if (url.protocol !== "https:" || !trusted) {
    throw new BadRequestException("untrusted WeCom image URL");
  }
}
