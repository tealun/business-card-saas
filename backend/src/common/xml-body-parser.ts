import type { FastifyInstance } from "fastify";
import { FastifyAdapter } from "@nestjs/platform-fastify";

const xmlContentTypes = ["application/xml", "text/xml"];

export function registerXmlBodyParser(adapter: FastifyAdapter): void {
  const fastify = adapter.getInstance() as FastifyInstance;
  for (const contentType of xmlContentTypes) {
    fastify.addContentTypeParser(contentType, { parseAs: "string" }, (_request, body, done) => {
      done(null, typeof body === "string" ? body : body.toString("utf8"));
    });
  }
}
