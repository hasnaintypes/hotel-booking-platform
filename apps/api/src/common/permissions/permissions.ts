import type { AppRole } from "../decorators/roles.decorator";

/**
 * Fine-grained capabilities for manual booking and reconciliation operations.
 *
 * The permissions exist so an operator can be given exactly one manual lever — for example only
 * `booking.cancel` — without the role model having to grow. Today `admin` holds every permission
 * and `user` holds none, which keeps the existing behaviour while the call sites move from
 * "is an admin" to "may perform this action".
 */
export const PERMISSIONS = [
  "booking.read",
  "booking.cancel",
  "booking.retry",
  "booking.mark_reviewed",
  "reconciliation.read",
  "reconciliation.manage",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

export const ROLE_PERMISSIONS: Record<AppRole, readonly Permission[]> = {
  admin: PERMISSIONS,
  user: [],
};

/** Unknown roles get nothing rather than falling through to a permissive default. */
export const permissionsForRole = (role: string | undefined): readonly Permission[] =>
  role === "admin" || role === "user" ? ROLE_PERMISSIONS[role] : [];

export const hasPermission = (role: string | undefined, permission: Permission): boolean =>
  permissionsForRole(role).includes(permission);

export const isPermission = (value: unknown): value is Permission =>
  typeof value === "string" && (PERMISSIONS as readonly string[]).includes(value);
