import type { ArgumentMetadata, PipeTransform } from "@nestjs/common";
import { ValidationPipe } from "@nestjs/common";
import { ZodValidationPipe } from "nestjs-zod";

/** DTO classes produced by `createZodDto` advertise this static flag. */
const isZodDto = (metatype: unknown): boolean =>
  typeof metatype === "function" && (metatype as { isZodDto?: unknown }).isZodDto === true;

/**
 * One validation entry point for the whole API while the endpoint groups move to Zod contracts.
 *
 * Parameters typed with a Zod DTO are validated by Zod; every remaining DTO keeps the
 * class-validator pipeline. Routing by DTO type (instead of registering both pipes globally) is
 * what prevents the class-validator `whitelist` option from stripping the properties of a Zod DTO.
 */
export class AppValidationPipe implements PipeTransform {
  private readonly zod = new ZodValidationPipe();

  constructor(private readonly classValidator: ValidationPipe) {}

  transform(value: unknown, metadata: ArgumentMetadata): unknown | Promise<unknown> {
    if (isZodDto(metadata.metatype)) return this.zod.transform(value, metadata);
    return this.classValidator.transform(value, metadata);
  }
}
