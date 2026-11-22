import { createZodDto } from "nestjs-zod";
import { loginResponseSchema } from "@hotel-booking/contracts";

/** `POST /api/v1/auth/login`. The session token travels in a cookie, not this body. */
export class LoginResponseDto extends createZodDto(loginResponseSchema) {}
