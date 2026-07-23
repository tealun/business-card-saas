import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { FastifyAdapter, NestFastifyApplication } from "@nestjs/platform-fastify";
import { Logger } from "nestjs-pino";
import { AppModule } from "./app.module.js";
import { registerXmlBodyParser } from "./common/xml-body-parser.js";
import helmet from "@fastify/helmet";
import { AppConfig } from "./config/app-config.js";

// Public endpoints only need small JSON bodies; image uploads (base64 data URLs,
// capped separately by STORAGE_MAX_UPLOAD_BYTES ~5MB => ~6.7MB base64) get a
// larger, route-scoped limit so anonymous routes cannot be used for large-body abuse.
const DEFAULT_BODY_LIMIT_BYTES = 1 * 1024 * 1024;
const UPLOAD_BODY_LIMIT_BYTES = 8 * 1024 * 1024;
const IMAGE_UPLOAD_BODY_LIMIT_BYTES = envPositiveInt("STORAGE_MAX_UPLOAD_BYTES", 5 * 1024 * 1024);
const VIDEO_UPLOAD_BODY_LIMIT_BYTES = envPositiveInt("STORAGE_MAX_VIDEO_UPLOAD_BYTES", 500 * 1024 * 1024);
const UPLOAD_ROUTE_LIMITS = [
  { matcher: /\/employee\/cards\/current(\/style)?$/, bytes: UPLOAD_BODY_LIMIT_BYTES },
  { matcher: /\/admin\/company-profile$/, bytes: UPLOAD_BODY_LIMIT_BYTES },
  { matcher: /\/admin\/templates(\/[^/]+)?$/, bytes: UPLOAD_BODY_LIMIT_BYTES },
  { matcher: /\/admin\/members\/[^/]+\/card$/, bytes: UPLOAD_BODY_LIMIT_BYTES },
  { matcher: /\/admin\/uploads\/images$/, bytes: IMAGE_UPLOAD_BODY_LIMIT_BYTES },
  { matcher: /\/admin\/uploads\/videos$/, bytes: VIDEO_UPLOAD_BODY_LIMIT_BYTES }
];
const RAW_MEDIA_CONTENT_TYPES = ["application/octet-stream", "image/jpeg", "image/jpg", "image/png", "image/webp", "video/mp4"];

async function bootstrap() {
  const adapter = new FastifyAdapter({ bodyLimit: DEFAULT_BODY_LIMIT_BYTES, trustProxy: "loopback" });
  adapter.getInstance().addHook("onRoute", (routeOptions) => {
    const methods = Array.isArray(routeOptions.method) ? routeOptions.method : [routeOptions.method];
    const isWrite = methods.some((method) => method === "POST" || method === "PUT");
    const limit = UPLOAD_ROUTE_LIMITS.find((item) => item.matcher.test(routeOptions.url));
    if (isWrite && limit) {
      routeOptions.bodyLimit = limit.bytes;
    }
  });
  registerRawMediaBodyParser(adapter);
  registerXmlBodyParser(adapter);
  const app = await NestFactory.create<NestFastifyApplication>(AppModule, adapter, {
    bufferLogs: true,
    abortOnError: false
  });
  app.useLogger(app.get(Logger));
  const config = app.get(AppConfig);

  const allowedOrigins = config.corsOrigins;
  if (config.isProduction && allowedOrigins.length === 0) {
    throw new Error("CORS_ORIGINS must be set in production");
  }

  app.setGlobalPrefix("api/v1");
  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:"],
        connectSrc: ["'self'"],
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"]
      }
    },
    crossOriginEmbedderPolicy: false,
    // WeChat Mini Program renders images and videos from an isolated origin
    // (for example with #devtools_no_referrer). Helmet's default same-origin
    // CORP makes otherwise public media fail with ERR_BLOCKED_BY_RESPONSE.
    crossOriginResourcePolicy: { policy: "cross-origin" }
  });
  app.enableCors({
    origin: (origin: string | undefined, callback: (error: Error | null, allow: boolean) => void) => {
      if (!origin || allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error("CORS origin not allowed"), false);
    },
    allowedHeaders: ["authorization", "content-type"],
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]
  });

  await app.listen({ port: config.port, host: config.host });
}

bootstrap().catch((error: unknown) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  // Nest/Pino may not be initialized when configuration or adapter startup
  // fails, so write directly to stderr for process managers such as BT-Panel.
  console.error(`[FATAL] Backend startup failed: ${message}`);
  process.exitCode = 1;
});

function envPositiveInt(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? Math.trunc(value) : fallback;
}

function registerRawMediaBodyParser(adapter: FastifyAdapter): void {
  for (const contentType of RAW_MEDIA_CONTENT_TYPES) {
    adapter.getInstance().addContentTypeParser(
      contentType,
      { parseAs: "buffer" },
      (_request: unknown, body: unknown, done: (error: Error | null, value?: Buffer) => void) => {
        done(null, Buffer.isBuffer(body) ? body : Buffer.from([]));
      }
    );
  }
}
