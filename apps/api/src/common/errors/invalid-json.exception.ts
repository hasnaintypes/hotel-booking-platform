import { BadRequestException } from "@nestjs/common";

/** The request body could not be parsed as JSON. */
export class InvalidJsonException extends BadRequestException {
  constructor() {
    super("The request body is not valid JSON.");
  }
}
