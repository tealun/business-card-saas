import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { FastifyAdapter, NestFastifyApplication } from "@nestjs/platform-fastify";
import { AppModule } from "./app.module.js";

async function bootstrap() {
  const allowedOrigins = (process.env.CORS_ORIGINS ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  if (process.env.NODE_ENV === "production" && allowedOrigins.length === 0) {
    throw new Error("CORS_ORIGINS must be set in production");
  }

  const app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter());
  app.setGlobalPrefix("api/v1");
  app.enableCors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error("CORS origin not allowed"), false);
    },
    allowedHeaders: ["authorization", "content-type"],
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"]
  });

  const port = Number(process.env.PORT ?? 3000);
  const host = process.env.HOST ?? "0.0.0.0";
  await app.listen({ port, host });
}

void bootstrap();
