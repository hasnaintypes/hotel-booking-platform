import { IsIn } from "class-validator";
import { AppRole } from "../../../common/decorators/roles.decorator";

export const APP_ROLES: AppRole[] = ["user", "admin", "hotel_owner"];

export class UpdateRoleDto {
  @IsIn(APP_ROLES, {
    message: `role must be one of: ${APP_ROLES.join(", ")}`,
  })
  role: AppRole;
}
