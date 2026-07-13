import {
  BadRequestException,
  HttpException,
  HttpStatus,
  type ArgumentsHost
} from "@nestjs/common";
import { z } from "zod";
import { ApiExceptionFilter } from "./api-exception.filter.js";

interface CapturedResponse {
  status: number;
  body: { code: number; message: string; data: unknown; trace_id: string };
}

function hostFor(traceId?: string): { host: ArgumentsHost; captured: () => CapturedResponse } {
  let captured: CapturedResponse | undefined;
  const reply = {
    status(status: number) {
      return {
        send(body: CapturedResponse["body"]) {
          captured = { status, body };
        }
      };
    }
  };
  const host = {
    switchToHttp: () => ({
      getRequest: () => ({ traceId }),
      getResponse: () => reply
    })
  } as unknown as ArgumentsHost;
  return { host, captured: () => captured! };
}

describe("ApiExceptionFilter", () => {
  const filter = new ApiExceptionFilter();

  it("maps a Zod validation error to a generic 400 without leaking field details", () => {
    const { host, captured } = hostFor("trace-1");
    const zodError = z.object({ code: z.string().min(1) }).safeParse({ code: "" });
    if (zodError.success) {
      throw new Error("expected schema to fail");
    }

    filter.catch(zodError.error, host);

    const { status, body } = captured();
    expect(status).toBe(400);
    expect(body.code).toBe(20001);
    expect(body.message).toBe("invalid request payload");
    expect(body.message).not.toContain("code");
    expect(body.trace_id).toBe("trace-1");
  });

  it("passes through curated HttpException status and message", () => {
    const { host, captured } = hostFor("trace-2");

    filter.catch(new BadRequestException("bad code"), host);

    const { status, body } = captured();
    expect(status).toBe(400);
    expect(body.message).toBe("bad code");
  });

  it.each([
    [HttpStatus.UNPROCESSABLE_ENTITY, 20022],
    [HttpStatus.TOO_MANY_REQUESTS, 40029],
    [HttpStatus.SERVICE_UNAVAILABLE, 50003]
  ])("maps HTTP status %i to API code %i", (status, code) => {
    const { host, captured } = hostFor(`trace-${status}`);
    filter.catch(new HttpException("mapped error", status), host);
    expect(captured()).toMatchObject({ status, body: { code, message: "mapped error" } });
  });

  it("replaces unknown errors with a generic 500", () => {
    const { host, captured } = hostFor("trace-3");

    filter.catch(new Error("pg: relation does not exist"), host);

    const { status, body } = captured();
    expect(status).toBe(500);
    expect(body.code).toBe(50001);
    expect(body.message).toBe("internal server error");
  });
});
