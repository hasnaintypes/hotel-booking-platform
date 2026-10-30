import { SetMetadata } from "@nestjs/common";

export type AppRole = "user" | "admin" | "hotel_owner";

export const ROLES_KEY = "roles";

export const Roles = (...roles: AppRole[]) => SetMetadata(ROLES_KEY, roles);
