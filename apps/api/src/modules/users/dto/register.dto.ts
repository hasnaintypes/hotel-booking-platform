import { createZodDto } from "nestjs-zod";
import { registerRequestSchema } from "@hotel-booking/contracts";

/**
 * `POST /api/v1/auth/register`. The password policy applies to new accounts only; login keeps its
 * older, looser rule so accounts created before it can still sign in.
 */
export class RegisterDto extends createZodDto(registerRequestSchema) {}
