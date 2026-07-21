import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { createReadStream } from "node:fs";
import { mkdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { AppConfig } from "../config/app-config.js";

type StorageCategory = "avatars" | "logos" | "card-backgrounds" | "wechat-qrcodes" | "company-images" | "videos" | "honors" | "templates";

interface StoredObject {
  publicUrl: string;
  storageKey: string;
}

interface LocalObject {
  stream: Readable;
  contentType: string;
  contentLength: number;
}

interface RemoteStorage {
  client: S3Client;
  bucket: string;
}

const MIME_EXTENSIONS: Record<string, { ext: string; contentType: string }> = {
  "image/jpeg": { ext: "jpg", contentType: "image/jpeg" },
  "image/jpg": { ext: "jpg", contentType: "image/jpeg" },
  "image/png": { ext: "png", contentType: "image/png" },
  "image/webp": { ext: "webp", contentType: "image/webp" }
};

@Injectable()
export class StorageService {
  private readonly remoteStorage: RemoteStorage | null;

  constructor(private readonly config: AppConfig) {
    this.remoteStorage = this.createRemoteStorage();
  }

  async storeImageDataUrl(input: { tenantId: string; category: StorageCategory; dataUrl: string }): Promise<StoredObject> {
    const parsed = parseImageDataUrl(input.dataUrl);
    if (parsed.buffer.length > this.config.storageMaxUploadBytes) {
      throw new BadRequestException("uploaded image exceeds STORAGE_MAX_UPLOAD_BYTES");
    }
    return this.storeBuffer(input.tenantId, input.category, parsed.ext, parsed.contentType, parsed.buffer);
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
    return this.storeBuffer(input.tenantId, input.category, format.ext, format.contentType, buffer);
  }

  async readLocalObject(input: { tenantId: string; category: string; fileName: string }): Promise<LocalObject> {
    const storageKey = buildStorageKey(input.tenantId, input.category, input.fileName);
    if (this.config.storageDriver === "local") {
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
    if (!this.remoteStorage) {
      throw new NotFoundException("remote storage is not enabled");
    }
    try {
      const response = await this.remoteStorage.client.send(new GetObjectCommand({
        Bucket: this.remoteStorage.bucket,
        Key: storageKey
      }));
      const body = response.Body;
      if (!body) {
        throw new NotFoundException("stored object not found");
      }
      const stream = body instanceof Readable ? body : Readable.fromWeb(body as globalThis.ReadableStream<Uint8Array>);
      return {
        stream,
        contentType: response.ContentType ?? contentTypeForFile(input.fileName),
        contentLength: Number(response.ContentLength ?? 0)
      };
    } catch (error) {
      if (isMissingStorageObject(error)) {
        throw new NotFoundException("stored object not found");
      }
      throw error;
    }
  }

  private async storeBuffer(tenantId: string, category: StorageCategory, ext: string, contentType: string, buffer: Buffer): Promise<StoredObject> {
    const fileName = `${Date.now()}-${randomUUID()}.${ext}`;
    const storageKey = buildStorageKey(tenantId, category, fileName);
    await this.writeObject(storageKey, buffer, contentType);
    return {
      storageKey,
      publicUrl: this.resolvePublicUrl(storageKey)
    };
  }

  private async writeObject(storageKey: string, buffer: Buffer, contentType: string): Promise<void> {
    if (!this.remoteStorage) {
      const absolutePath = this.resolveLocalKey(storageKey);
      await mkdir(path.dirname(absolutePath), { recursive: true });
      await writeFile(absolutePath, buffer);
      return;
    }
    await this.remoteStorage.client.send(new PutObjectCommand({
      Bucket: this.remoteStorage.bucket,
      Key: storageKey,
      Body: buffer,
      ContentType: contentType,
      CacheControl: "public, max-age=31536000, immutable"
    }));
  }

  private resolvePublicUrl(storageKey: string): string {
    return this.config.storagePublicBaseUrl ? `${this.config.storagePublicBaseUrl}/${storageKey}` : `/api/v1/storage/${storageKey}`;
  }

  private createRemoteStorage(): RemoteStorage | null {
    if (this.config.storageDriver === "local") {
      return null;
    }
    if (this.config.storageDriver === "aliyun_oss") {
      const remote = this.config.aliyunOssConfig;
      return {
        bucket: remote.bucket,
        client: new S3Client({
          region: remote.region,
          endpoint: remote.endpoint,
          credentials: {
            accessKeyId: remote.accessKeyId,
            secretAccessKey: remote.accessKeySecret
          },
          forcePathStyle: true
        })
      };
    }
    const remote = this.config.s3Config;
    return {
      bucket: remote.bucket,
      client: new S3Client({
        region: remote.region,
        endpoint: remote.endpoint,
        credentials: {
          accessKeyId: remote.accessKeyId,
          secretAccessKey: remote.secretAccessKey
        },
        forcePathStyle: remote.forcePathStyle
      })
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

function buildStorageKey(tenantId: string, category: string, fileName: string): string {
  return `tenant/${safeSegment(tenantId)}/${safeSegment(category)}/${safeSegment(fileName)}`;
}

function isMissingStorageObject(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { name?: unknown; $metadata?: { httpStatusCode?: unknown } };
  return candidate.name === "NoSuchKey" || candidate.name === "NotFound" || candidate.$metadata?.httpStatusCode === 404;
}
