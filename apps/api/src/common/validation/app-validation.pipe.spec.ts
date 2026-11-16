import type { ArgumentMetadata } from "@nestjs/common";
import { ValidationPipe } from "@nestjs/common";
import { IsString } from "class-validator";
import { createZodDto, ZodValidationException } from "nestjs-zod";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  ValidationFailedException,
  flattenValidationErrors,
} from "../errors/validation-failed.exception";
import { AppValidationPipe } from "./app-validation.pipe";

class LegacyDto {
  @IsString()
  name!: string;
}

class ZodDto extends createZodDto(z.object({ page: z.coerce.number().int().min(1) })) {}

const classValidator = new ValidationPipe({
  whitelist: true,
  transform: true,
  exceptionFactory: (errors) => new ValidationFailedException(flattenValidationErrors(errors)),
});

const pipe = new AppValidationPipe(classValidator);

const metadata = (metatype: unknown, type: "body" | "query" = "query"): ArgumentMetadata => ({
  type,
  metatype: metatype as ArgumentMetadata["metatype"],
  data: undefined,
});

describe("AppValidationPipe", () => {
  it("validates a Zod DTO with Zod and keeps every property", async () => {
    const result = (await pipe.transform({ page: "2" }, metadata(ZodDto))) as { page: number };

    expect(result.page).toBe(2);
  });

  it("rejects an invalid Zod DTO with the Zod exception the filter maps", async () => {
    const attempt = async () => pipe.transform({ page: "0" }, metadata(ZodDto));

    await expect(attempt()).rejects.toBeInstanceOf(ZodValidationException);
  });

  it("keeps class-validator for every other DTO", async () => {
    const result = (await pipe.transform({ name: "Paris" }, metadata(LegacyDto, "body"))) as {
      name: string;
    };
    expect(result).toBeInstanceOf(LegacyDto);
    expect(result.name).toBe("Paris");

    const attempt = async () => pipe.transform({ name: 42 }, metadata(LegacyDto, "body"));

    await expect(attempt()).rejects.toBeInstanceOf(ValidationFailedException);
  });

  it("does not strip the fields of a Zod DTO (the reason the pipe dispatches by type)", async () => {
    // The class-validator pipe with `whitelist` reports every undeclared property of a Zod DTO as an
    // error, so a plain double registration would reject every valid request.
    const result = (await pipe.transform({ page: 3 }, metadata(ZodDto))) as Record<string, unknown>;
    expect(Object.keys(result)).toEqual(["page"]);
  });
});
