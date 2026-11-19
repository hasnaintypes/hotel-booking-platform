import { createZodDto } from "nestjs-zod";
import { updateRoleRequestSchema } from "@hotel-booking/contracts";

/** `PATCH /api/v1/admin/users/:id`. */
export class UpdateRoleDto extends createZodDto(updateRoleRequestSchema) {}
