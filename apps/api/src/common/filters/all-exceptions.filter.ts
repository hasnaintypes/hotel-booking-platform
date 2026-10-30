import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from "@nestjs/common";
import { Response } from "express";

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();
    const status =
      exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;

    const body = exception instanceof HttpException ? exception.getResponse() : null;

    if (body && typeof body === "object") {
      const payload = body as Record<string, unknown>;

      if (typeof payload.message !== "undefined") {
        if (!("statusCode" in payload)) {
          return response.status(status).json(payload);
        }
        const extra = payload.errors ? { errors: payload.errors } : {};
        return response.status(status).json({ message: payload.message, ...extra });
      }

      if (typeof payload.error !== "undefined") {
        return response.status(status).json(payload);
      }
    }

    if (typeof body === "string") {
      return response.status(status).json({ message: body });
    }

    this.logger.error(exception instanceof Error ? exception.stack : String(exception));

    return response.status(status).json({ message: "Something went wrong" });
  }
}
