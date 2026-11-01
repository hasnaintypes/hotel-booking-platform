import { HttpException, HttpStatus } from "@nestjs/common";

/** A 429 that tells the client how long to wait (sent as the Retry-After header). */
export class RateLimitedException extends HttpException {
  constructor(
    message: string,
    public readonly retryAfterSeconds: number,
  ) {
    super(message, HttpStatus.TOO_MANY_REQUESTS);
  }
}
