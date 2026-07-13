import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { ZodError } from "zod";

function errorCode(status: number): number {
  if (status === HttpStatus.UNAUTHORIZED) {
    return 10001;
  }
  if (status === HttpStatus.FORBIDDEN) {
    return 30001;
  }
  if (status === HttpStatus.BAD_REQUEST) {
    return 20001;
  }
  if (status === HttpStatus.NOT_FOUND) {
    return 30004;
  }
  if (status === HttpStatus.CONFLICT) {
    return 30009;
  }
  if (status === HttpStatus.UNPROCESSABLE_ENTITY) {
    return 20022;
  }
  if (status === HttpStatus.TOO_MANY_REQUESTS) {
    return 40029;
  }
  if (status === HttpStatus.SERVICE_UNAVAILABLE) {
    return 50003;
  }
  return 50001;
}

function errorMessage(exception: unknown): string {
  if (exception instanceof HttpException) {
    const response = exception.getResponse();
    if (typeof response === "string") {
      return response;
    }
    if (typeof response === "object" && response !== null && "message" in response) {
      const message = (response as { message: unknown }).message;
      return Array.isArray(message) ? message.join("; ") : String(message);
    }
    return exception.message;
  }
  if (exception instanceof Error) {
    return exception.message;
  }
  return "internal server error";
}

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(ApiExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const context = host.switchToHttp();
    const request = context.getRequest<{ traceId?: string }>();
    const reply = context.getResponse<{ status: (status: number) => { send: (body: unknown) => void } }>();
    const isHttpException = exception instanceof HttpException;
    const isValidationError = exception instanceof ZodError;
    const status = isHttpException
      ? exception.getStatus()
      : isValidationError
        ? HttpStatus.BAD_REQUEST
        : HttpStatus.INTERNAL_SERVER_ERROR;
    const traceId = request.traceId ?? randomUUID();

    // Only expose curated HttpException messages. Unhandled errors (e.g. pg driver
    // errors exposing schema/query fragments) are logged server-side by trace_id and
    // replaced with a generic message so internal details never reach the client (A54-P1-2).
    // Request-body schema failures are client errors, not 500s: surface a generic 400
    // without echoing the raw Zod issue list (which can leak field/shape internals).
    let message: string;
    if (isHttpException) {
      message = errorMessage(exception);
    } else if (isValidationError) {
      message = "invalid request payload";
    } else {
      message = "internal server error";
      this.logger.error(
        `Unhandled exception trace_id=${traceId}: ${errorMessage(exception)}`,
        exception instanceof Error ? exception.stack : undefined
      );
    }

    reply.status(status).send({
      code: errorCode(status),
      message,
      data: null,
      trace_id: traceId
    });
  }
}
