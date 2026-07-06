import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { map, Observable } from "rxjs";

export interface ApiResponse<T> {
  code: 0;
  message: "ok";
  data: T;
  trace_id: string;
}

@Injectable()
export class ApiResponseInterceptor<T> implements NestInterceptor<T, ApiResponse<T>> {
  intercept(context: ExecutionContext, next: CallHandler<T>): Observable<ApiResponse<T>> {
    const request = context.switchToHttp().getRequest<{ traceId?: string }>();
    request.traceId = request.traceId ?? randomUUID();
    return next.handle().pipe(
      map((data) => ({
        code: 0,
        message: "ok" as const,
        data,
        trace_id: request.traceId ?? randomUUID()
      }))
    );
  }
}
