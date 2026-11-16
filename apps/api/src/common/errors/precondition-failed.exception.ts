import { HttpException, HttpStatus } from "@nestjs/common";

/** A conditional update whose `If-Match` no longer matches the current representation. */
export class PreconditionFailedException extends HttpException {
  constructor(detail = "The resource has changed since it was read.") {
    super({ message: detail }, HttpStatus.PRECONDITION_FAILED);
  }
}
