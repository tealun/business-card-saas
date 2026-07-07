import "reflect-metadata";
import { Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { FastifyAdapter, NestFastifyApplication } from "@nestjs/platform-fastify";
import { AppModule } from "./app.module.js";
import { registerXmlBodyParser } from "./common/xml-body-parser.js";
import helmet from "@fastify/helmet";
import { AppConfig } from "./config/app-config.js";

async function bootstrap() {
  const adapter = new FastifyAdapter();
  registerXmlBodyParser(adapter);
  const app = await NestFactory.create<NestFastifyApplication>(AppModule, adapter, { bufferLogs: true });
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
    crossOriginEmbedderPolicy: false
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
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"]
  });

  await app.listen({ port: config.port, host: config.host });
}

void bootstrap();
