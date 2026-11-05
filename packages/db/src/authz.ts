import { and, eq } from "drizzle-orm";
import type { Database } from "./client.js";
import type { UserRole } from "./schema/enums.js";
import { memberships } from "./schema/memberships.js";
import { organisations, rolePermissions } from "./schema/organisations.js";

/**
 * Permission codes are code constants, not database rows. Roles reference these codes through
 * `role_permissions`, so adding a permission is a code change plus a migration for the check
 * constraint and the seeded mappings.
 */
export const PERMISSIONS = {
  hotelRead: "hotel:read",
  hotelCreate: "hotel:create",
  hotelUpdate: "hotel:update",
  hotelDelete: "hotel:delete",
  bookingRead: "booking:read",
  bookingCreate: "booking:create",
  bookingUpdate: "booking:update",
  bookingCancel: "booking:cancel",
  organisationRead: "organisation:read",
  organisationManage: "organisation:manage",
  membershipManage: "membership:manage",
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

const PERMISSION_VALUES = new Set<string>(Object.values(PERMISSIONS));

export function isPermission(value: string): value is Permission {
  return PERMISSION_VALUES.has(value);
}

const ownerPermissions = Object.values(PERMISSIONS);
const managerPermissions: readonly Permission[] = [
  PERMISSIONS.hotelRead,
  PERMISSIONS.hotelCreate,
  PERMISSIONS.hotelUpdate,
  PERMISSIONS.bookingRead,
  PERMISSIONS.bookingCreate,
  PERMISSIONS.bookingUpdate,
  PERMISSIONS.bookingCancel,
  PERMISSIONS.organisationRead,
];
const memberPermissions: readonly Permission[] = [
  PERMISSIONS.hotelRead,
  PERMISSIONS.bookingRead,
  PERMISSIONS.bookingCreate,
  PERMISSIONS.bookingUpdate,
  PERMISSIONS.organisationRead,
];
const viewerPermissions: readonly Permission[] = [
  PERMISSIONS.hotelRead,
  PERMISSIONS.bookingRead,
  PERMISSIONS.organisationRead,
];

/**
 * Seeded mapping between organisation roles and permissions. The migration inserts the same
 * rows; this map documents the intended roles and is used by tests and seeding tools.
 */
export const ORGANISATION_ROLE_PERMISSIONS: Readonly<Record<string, ReadonlySet<Permission>>> = {
  owner: new Set(ownerPermissions),
  manager: new Set(managerPermissions),
  member: new Set(memberPermissions),
  viewer: new Set(viewerPermissions),
};

/** Permissions a user gets from owning a hotel directly through `hotels.owner_user_id`. */
export const DIRECT_HOTEL_OWNER_PERMISSIONS: ReadonlySet<Permission> = new Set([
  PERMISSIONS.hotelRead,
  PERMISSIONS.hotelUpdate,
  PERMISSIONS.hotelDelete,
]);

/** Permissions a user gets from being the guest named on `bookings.owner_user_id`. */
export const DIRECT_BOOKING_OWNER_PERMISSIONS: ReadonlySet<Permission> = new Set([
  PERMISSIONS.bookingRead,
  PERMISSIONS.bookingUpdate,
  PERMISSIONS.bookingCancel,
]);

export type Actor = {
  userId: string;
  role: UserRole;
};

export type Resource =
  | { type: "none" }
  | { type: "user"; id: string }
  | {
      type: "hotel";
      id?: string;
      ownerUserId?: string | null;
      organisationId?: string | null;
    }
  | {
      type: "booking";
      id?: string;
      userId?: string | null;
      organisationId?: string | null;
    }
  | { type: "organisation"; id: string };

/** Resolves the permissions a user holds in one organisation. */
export type OrganisationPermissionLookup = (organisationId: string) => ReadonlySet<Permission>;

const NO_PERMISSIONS: ReadonlySet<Permission> = new Set();

/**
 * Pure authorisation decision. Access comes only from the platform `admin` role, direct resource
 * ownership, or the permission set for the resource's own organisation. A membership in another
 * organisation never applies, so access cannot widen by joining additional organisations.
 */
export function canWithPermissions(
  actor: Actor,
  permission: Permission,
  resource: Resource,
  permissionsForOrganisation: OrganisationPermissionLookup,
): boolean {
  if (!isPermission(permission)) return false;
  if (actor.role === "admin") return true;

  switch (resource.type) {
    case "none":
      return false;
    case "user":
      return resource.id === actor.userId && permission === PERMISSIONS.bookingCreate;
    case "hotel": {
      if (resource.ownerUserId === actor.userId && DIRECT_HOTEL_OWNER_PERMISSIONS.has(permission)) {
        return true;
      }
      return resource.organisationId
        ? permissionsForOrganisation(resource.organisationId).has(permission)
        : false;
    }
    case "booking": {
      if (resource.userId === actor.userId && DIRECT_BOOKING_OWNER_PERMISSIONS.has(permission)) {
        return true;
      }
      return resource.organisationId
        ? permissionsForOrganisation(resource.organisationId).has(permission)
        : false;
    }
    case "organisation":
      return permissionsForOrganisation(resource.id).has(permission);
  }
}

export type AuthorizationDatabase = Pick<Database, "select">;

async function loadOrganisationPermissions(
  db: AuthorizationDatabase,
  userId: string,
  organisationId: string,
): Promise<ReadonlySet<Permission>> {
  const rows = await db
    .select({ permission: rolePermissions.permission })
    .from(memberships)
    .innerJoin(organisations, eq(organisations.id, memberships.organisationId))
    .innerJoin(rolePermissions, eq(rolePermissions.roleKey, memberships.roleKey))
    .where(
      and(
        eq(memberships.userId, userId),
        eq(memberships.organisationId, organisationId),
        eq(organisations.status, "active"),
      ),
    );

  const permissions = new Set<Permission>();
  for (const row of rows) {
    if (isPermission(row.permission)) permissions.add(row.permission);
  }
  return permissions;
}

export type Authorizer = {
  can: (actor: Actor, permission: Permission, resource: Resource) => Promise<boolean>;
};

/**
 * Binds the authorisation helper to a database handle. Guards and services call
 * `can(actor, permission, resource)` and the helper loads the actor's membership for the
 * resource's organisation only when organisation ownership is involved.
 */
export function createAuthorizer(db: AuthorizationDatabase): Authorizer {
  return {
    async can(actor, permission, resource) {
      if (!isPermission(permission)) return false;
      if (actor.role === "admin") return true;

      const organisationId =
        resource.type === "organisation"
          ? resource.id
          : resource.type === "hotel" || resource.type === "booking"
            ? resource.organisationId
            : null;

      if (!organisationId) {
        return canWithPermissions(actor, permission, resource, () => NO_PERMISSIONS);
      }

      const permissions = await loadOrganisationPermissions(db, actor.userId, organisationId);
      return canWithPermissions(actor, permission, resource, (id) =>
        id === organisationId ? permissions : NO_PERMISSIONS,
      );
    },
  };
}
