import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from "@nestjs/common";
import { randomUUID } from "node:crypto";

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
  catch(exception: unknown, host: ArgumentsHost) {
    const context = host.switchToHttp();
    const request = context.getRequest<{ traceId?: string }>();
    const reply = context.getResponse<{ status: (status: number) => { send: (body: unknown) => void } }>();
    const status = exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    const traceId = request.traceId ?? randomUUID();

    reply.status(status).send({
      code: errorCode(status),
      message: errorMessage(exception),
      data: null,
      trace_id: traceId
    });
  }
}
