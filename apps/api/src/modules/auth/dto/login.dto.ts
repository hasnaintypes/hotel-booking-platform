import { createZodDto } from "nestjs-zod";
import { loginRequestSchema } from "@hotel-booking/contracts";

/** `POST /api/v1/auth/login`. The password rule is looser than registration on purpose. */
export class LoginDto extends createZodDto(loginRequestSchema) {}
