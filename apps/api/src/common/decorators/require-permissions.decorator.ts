import { SetMetadata } from "@nestjs/common";
import type { Permission } from "../permissions/permissions";

export const PERMISSIONS_KEY = "permissions";

/** Requires every listed permission. See `PermissionsGuard`. */
export const RequirePermissions = (...permissions: Permission[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);
