import { createZodDto } from "nestjs-zod";
import { adminUserListQuerySchema } from "@hotel-booking/contracts";

/** `GET /api/v1/admin/users` — accounts, newest first, with role, status and text filters. */
export class AdminUserListQueryDto extends createZodDto(adminUserListQuerySchema) {}
