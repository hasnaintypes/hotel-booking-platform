import { createZodDto } from "nestjs-zod";
import { adminUserPageSchema, publicUserSchema } from "@hotel-booking/contracts";

/** `GET /api/v1/me` and `PATCH /api/v1/me`. */
export class PublicUserDto extends createZodDto(publicUserSchema) {}

/** `GET /api/v1/admin/users`. */
export class AdminUserPageDto extends createZodDto(adminUserPageSchema) {}
