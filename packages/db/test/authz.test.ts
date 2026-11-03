import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  canWithPermissions,
  createAuthorizer,
  createDb,
  DIRECT_BOOKING_OWNER_PERMISSIONS,
  DIRECT_HOTEL_OWNER_PERMISSIONS,
  isPermission,
  ORGANISATION_ROLE_PERMISSIONS,
  PERMISSIONS,
  type Actor,
  type Database,
  type DatabaseHandle,
  type Permission,
  type Resource,
} from "../src/index.js";
import { bookings } from "../src/schema/bookings.js";
import { hotels } from "../src/schema/hotels.js";
import { memberships } from "../src/schema/memberships.js";
import { organisations, rolePermissions } from "../src/schema/organisations.js";
import { users } from "../src/schema/users.js";

const url = process.env.TEST_DATABASE_URL;
const packageRoot = fileURLToPath(new URL("..", import.meta.url));

type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

const unique = (prefix: string) => `${prefix}-${randomUUID()}@example.test`;
const uniqueSlug = () => `org-${randomUUID()}`;

async function insertUser(tx: Transaction, role: "user" | "admin" = "user") {
  const [row] = await tx
    .insert(users)
    .values({ email: unique("authz"), role })
    .returning({ id: users.id });
  return row!.id;
}

async function insertOrganisation(tx: Transaction) {
  const [row] = await tx
    .insert(organisations)
    .values({ name: "Test Agency", slug: uniqueSlug() })
    .returning({ id: organisations.id });
  return row!.id;
}

async function insertMembership(
  tx: Transaction,
  userId: string,
  organisationId: string,
  roleKey: string,
) {
  await tx.insert(memberships).values({ userId, organisationId, roleKey });
}

async function insertHotel(
  tx: Transaction,
  input: {
    ownerUserId?: string;
    organisationId?: string;
    createdByUserId: string;
  },
) {
  const [row] = await tx
    .insert(hotels)
    .values({
      ownerUserId: input.ownerUserId,
      organisationId: input.organisationId,
      createdByUserId: input.createdByUserId,
      name: "Harbour Hotel",
      description: "A test hotel",
      city: "Bristol",
      country: "United Kingdom",
      countryCode: "GB",
      starRating: 4,
      pricePerNightMinor: 12_500,
    })
    .returning({ id: hotels.id });
  return row!.id;
}

async function insertBooking(
  tx: Transaction,
  input: {
    userId: string;
    hotelId: string;
    organisationId?: string;
    createdByUserId: string;
  },
) {
  const [row] = await tx
    .insert(bookings)
    .values({
      userId: input.userId,
      hotelId: input.hotelId,
      organisationId: input.organisationId,
      createdByUserId: input.createdByUserId,
      checkIn: new Date("2026-12-01"),
      checkOut: new Date("2026-12-03"),
    })
    .returning({ id: bookings.id });
  return row!.id;
}

describe.skipIf(!url)("authorisation on PostgreSQL", () => {
  let handle: DatabaseHandle;

  beforeAll(async () => {
    execFileSync("pnpm", ["db:migrate"], {
      cwd: packageRoot,
      env: { ...process.env, DATABASE_URL: url },
      stdio: "pipe",
    });
    handle = createDb({ connectionString: url! });
  });

  afterAll(async () => {
    await handle.close();
  });

  const inRollback = async (run: (tx: Transaction) => Promise<void>) => {
    const rollback = new Error("rollback test transaction");
    try {
      await handle.db.transaction(async (tx) => {
        await run(tx);
        throw rollback;
      });
    } catch (error) {
      if (error !== rollback) throw error;
    }
  };

  const actor = (userId: string, role: "user" | "admin" = "user"): Actor => ({
    userId,
    role,
  });

  const setup = async (tx: Transaction) => {
    const admin = await insertUser(tx, "admin");
    const guest = await insertUser(tx);
    const guestTwo = await insertUser(tx);
    const directOwner = await insertUser(tx);
    const orgOwner = await insertUser(tx);
    const orgManager = await insertUser(tx);
    const orgMember = await insertUser(tx);
    const orgViewer = await insertUser(tx);
    const outsider = await insertUser(tx);
    const multiOrg = await insertUser(tx);

    const orgA = await insertOrganisation(tx);
    const orgB = await insertOrganisation(tx);
    await insertMembership(tx, orgOwner, orgA, "owner");
    await insertMembership(tx, orgManager, orgA, "manager");
    await insertMembership(tx, orgMember, orgA, "member");
    await insertMembership(tx, orgViewer, orgA, "viewer");
    await insertMembership(tx, multiOrg, orgA, "member");
    await insertMembership(tx, multiOrg, orgB, "owner");

    const directHotel = await insertHotel(tx, {
      ownerUserId: directOwner,
      createdByUserId: directOwner,
    });
    const hotelA = await insertHotel(tx, {
      organisationId: orgA,
      createdByUserId: orgOwner,
    });
    const hotelB = await insertHotel(tx, {
      organisationId: orgB,
      createdByUserId: orgOwner,
    });

    const guestBooking = await insertBooking(tx, {
      userId: guest,
      hotelId: hotelA,
      createdByUserId: guest,
    });
    const bookingA = await insertBooking(tx, {
      userId: guestTwo,
      hotelId: hotelA,
      organisationId: orgA,
      createdByUserId: orgOwner,
    });
    const bookingB = await insertBooking(tx, {
      userId: guestTwo,
      hotelId: hotelB,
      organisationId: orgB,
      createdByUserId: orgOwner,
    });

    return {
      ids: {
        admin,
        guest,
        guestTwo,
        directOwner,
        orgOwner,
        orgManager,
        orgMember,
        orgViewer,
        outsider,
        multiOrg,
        orgA,
        orgB,
        directHotel,
        hotelA,
        hotelB,
        guestBooking,
        bookingA,
        bookingB,
      },
      can: createAuthorizer(tx).can,
    };
  };

  it("lets a guest act only on their own booking", async () => {
    await inRollback(async (tx) => {
      const { ids, can } = await setup(tx);
      const guest = actor(ids.guest);

      await expect(
        can(guest, PERMISSIONS.bookingRead, {
          type: "booking",
          id: ids.guestBooking,
          userId: ids.guest,
        }),
      ).resolves.toBe(true);
      await expect(
        can(guest, PERMISSIONS.bookingCancel, {
          type: "booking",
          id: ids.guestBooking,
          userId: ids.guest,
        }),
      ).resolves.toBe(true);
      await expect(
        can(guest, PERMISSIONS.bookingRead, {
          type: "booking",
          id: ids.bookingA,
          userId: ids.guestTwo,
          organisationId: ids.orgA,
        }),
      ).resolves.toBe(false);
      await expect(
        can(guest, PERMISSIONS.hotelRead, {
          type: "hotel",
          id: ids.hotelA,
          organisationId: ids.orgA,
        }),
      ).resolves.toBe(false);
    });
  });

  it("grants direct hotel owners hotel access but not bookings or other hotels", async () => {
    await inRollback(async (tx) => {
      const { ids, can } = await setup(tx);
      const owner = actor(ids.directOwner);

      await expect(
        can(owner, PERMISSIONS.hotelRead, {
          type: "hotel",
          id: ids.directHotel,
          ownerUserId: ids.directOwner,
        }),
      ).resolves.toBe(true);
      await expect(
        can(owner, PERMISSIONS.hotelUpdate, {
          type: "hotel",
          id: ids.directHotel,
          ownerUserId: ids.directOwner,
        }),
      ).resolves.toBe(true);
      await expect(
        can(owner, PERMISSIONS.hotelDelete, {
          type: "hotel",
          id: ids.directHotel,
          ownerUserId: ids.directOwner,
        }),
      ).resolves.toBe(true);
      await expect(
        can(owner, PERMISSIONS.hotelRead, {
          type: "hotel",
          id: ids.hotelA,
          organisationId: ids.orgA,
        }),
      ).resolves.toBe(false);
      await expect(
        can(owner, PERMISSIONS.bookingRead, {
          type: "booking",
          id: ids.guestBooking,
          userId: ids.guest,
        }),
      ).resolves.toBe(false);
    });
  });

  it("lets platform admins access every organisation and resource", async () => {
    await inRollback(async (tx) => {
      const { ids, can } = await setup(tx);
      const admin = actor(ids.admin, "admin");

      await expect(
        can(admin, PERMISSIONS.hotelDelete, {
          type: "hotel",
          id: ids.hotelB,
          organisationId: ids.orgB,
        }),
      ).resolves.toBe(true);
      await expect(
        can(admin, PERMISSIONS.membershipManage, {
          type: "organisation",
          id: ids.orgB,
        }),
      ).resolves.toBe(true);
      await expect(
        can(admin, PERMISSIONS.bookingRead, {
          type: "booking",
          id: ids.bookingB,
          userId: ids.guestTwo,
          organisationId: ids.orgB,
        }),
      ).resolves.toBe(true);
    });
  });

  it("applies each organisation role to its own organisation only", async () => {
    await inRollback(async (tx) => {
      const { ids, can } = await setup(tx);

      const owner = actor(ids.orgOwner);
      await expect(
        can(owner, PERMISSIONS.hotelDelete, {
          type: "hotel",
          id: ids.hotelA,
          organisationId: ids.orgA,
        }),
      ).resolves.toBe(true);
      await expect(
        can(owner, PERMISSIONS.membershipManage, { type: "organisation", id: ids.orgA }),
      ).resolves.toBe(true);
      await expect(
        can(owner, PERMISSIONS.hotelDelete, {
          type: "hotel",
          id: ids.hotelB,
          organisationId: ids.orgB,
        }),
      ).resolves.toBe(false);
      await expect(
        can(owner, PERMISSIONS.bookingRead, {
          type: "booking",
          id: ids.bookingB,
          userId: ids.guestTwo,
          organisationId: ids.orgB,
        }),
      ).resolves.toBe(false);

      const manager = actor(ids.orgManager);
      await expect(
        can(manager, PERMISSIONS.hotelUpdate, {
          type: "hotel",
          id: ids.hotelA,
          organisationId: ids.orgA,
        }),
      ).resolves.toBe(true);
      await expect(
        can(manager, PERMISSIONS.hotelDelete, {
          type: "hotel",
          id: ids.hotelA,
          organisationId: ids.orgA,
        }),
      ).resolves.toBe(false);
      await expect(
        can(manager, PERMISSIONS.membershipManage, { type: "organisation", id: ids.orgA }),
      ).resolves.toBe(false);

      const member = actor(ids.orgMember);
      await expect(
        can(member, PERMISSIONS.hotelRead, {
          type: "hotel",
          id: ids.hotelA,
          organisationId: ids.orgA,
        }),
      ).resolves.toBe(true);
      await expect(
        can(member, PERMISSIONS.hotelUpdate, {
          type: "hotel",
          id: ids.hotelA,
          organisationId: ids.orgA,
        }),
      ).resolves.toBe(false);
      await expect(
        can(member, PERMISSIONS.bookingCreate, { type: "organisation", id: ids.orgA }),
      ).resolves.toBe(true);
      await expect(
        can(member, PERMISSIONS.organisationManage, { type: "organisation", id: ids.orgA }),
      ).resolves.toBe(false);

      const viewer = actor(ids.orgViewer);
      await expect(
        can(viewer, PERMISSIONS.bookingRead, {
          type: "booking",
          id: ids.bookingA,
          userId: ids.guestTwo,
          organisationId: ids.orgA,
        }),
      ).resolves.toBe(true);
      await expect(
        can(viewer, PERMISSIONS.bookingCreate, { type: "organisation", id: ids.orgA }),
      ).resolves.toBe(false);
      await expect(
        can(viewer, PERMISSIONS.hotelUpdate, {
          type: "hotel",
          id: ids.hotelA,
          organisationId: ids.orgA,
        }),
      ).resolves.toBe(false);

      const outsider = actor(ids.outsider);
      for (const permission of Object.values(PERMISSIONS)) {
        await expect(
          can(outsider, permission, { type: "organisation", id: ids.orgA }),
        ).resolves.toBe(false);
      }

      const multiOrg = actor(ids.multiOrg);
      await expect(
        can(multiOrg, PERMISSIONS.bookingUpdate, {
          type: "booking",
          id: ids.bookingA,
          userId: ids.guestTwo,
          organisationId: ids.orgA,
        }),
      ).resolves.toBe(true);
      await expect(
        can(multiOrg, PERMISSIONS.bookingCancel, {
          type: "booking",
          id: ids.bookingA,
          userId: ids.guestTwo,
          organisationId: ids.orgA,
        }),
      ).resolves.toBe(false);
      await expect(
        can(multiOrg, PERMISSIONS.hotelDelete, {
          type: "hotel",
          id: ids.hotelB,
          organisationId: ids.orgB,
        }),
      ).resolves.toBe(true);
      await expect(
        can(multiOrg, PERMISSIONS.membershipManage, { type: "organisation", id: ids.orgB }),
      ).resolves.toBe(true);
      await expect(
        can(multiOrg, PERMISSIONS.membershipManage, { type: "organisation", id: ids.orgA }),
      ).resolves.toBe(false);
    });
  });

  it("keeps the seeded role permissions in step with the code mapping", async () => {
    await inRollback(async (tx) => {
      const rows = await tx
        .select({ roleKey: rolePermissions.roleKey, permission: rolePermissions.permission })
        .from(rolePermissions);

      const seeded = new Map<string, Set<Permission>>();
      for (const row of rows) {
        if (!isPermission(row.permission)) continue;
        const permissions = seeded.get(row.roleKey) ?? new Set<Permission>();
        permissions.add(row.permission);
        seeded.set(row.roleKey, permissions);
      }

      for (const [role, permissions] of Object.entries(ORGANISATION_ROLE_PERMISSIONS)) {
        expect(seeded.get(role)).toEqual(new Set(permissions));
      }
    });
  });

  it("denies organisation access to suspended organisations", async () => {
    await inRollback(async (tx) => {
      const { ids, can } = await setup(tx);
      await tx
        .update(organisations)
        .set({ status: "suspended" })
        .where(eq(organisations.id, ids.orgA));

      await expect(
        can(actor(ids.orgOwner), PERMISSIONS.hotelRead, {
          type: "hotel",
          id: ids.hotelA,
          organisationId: ids.orgA,
        }),
      ).resolves.toBe(false);
    });
  });
});

describe("authorisation invariants", () => {
  const allPermissions = Object.values(PERMISSIONS);
  const empty: ReadonlySet<Permission> = new Set();

  const mulberry32 = (seed: number) => () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let value = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };

  const expectedGrant = (
    actor: Actor,
    permission: Permission,
    resource: Resource,
    lookup: (organisationId: string) => ReadonlySet<Permission>,
  ) => {
    if (actor.role === "admin") return true;
    switch (resource.type) {
      case "none":
        return false;
      case "user":
        return resource.id === actor.userId && permission === PERMISSIONS.bookingCreate;
      case "hotel":
        if (
          resource.ownerUserId === actor.userId &&
          DIRECT_HOTEL_OWNER_PERMISSIONS.has(permission)
        ) {
          return true;
        }
        return resource.organisationId ? lookup(resource.organisationId).has(permission) : false;
      case "booking":
        if (resource.userId === actor.userId && DIRECT_BOOKING_OWNER_PERMISSIONS.has(permission)) {
          return true;
        }
        return resource.organisationId ? lookup(resource.organisationId).has(permission) : false;
      case "organisation":
        return lookup(resource.id).has(permission);
    }
  };

  it("never grants more than an explicit direct-ownership or same-organisation grant", () => {
    const random = mulberry32(101);
    const roleKeys = Object.keys(ORGANISATION_ROLE_PERMISSIONS);

    for (let iteration = 0; iteration < 500; iteration += 1) {
      const actor: Actor = {
        userId: `user-${Math.floor(random() * 4)}`,
        role: random() < 0.15 ? "admin" : "user",
      };
      const grants = new Map<string, ReadonlySet<Permission>>();
      for (const organisationId of ["org-a", "org-b"]) {
        if (random() < 0.6) {
          const role = roleKeys[Math.floor(random() * roleKeys.length)]!;
          grants.set(organisationId, ORGANISATION_ROLE_PERMISSIONS[role]!);
        }
      }
      const lookup = (organisationId: string) => grants.get(organisationId) ?? empty;

      const resources: Resource[] = [
        { type: "none" },
        { type: "user", id: actor.userId },
        { type: "user", id: "user-other" },
        {
          type: "hotel",
          ownerUserId: random() < 0.5 ? actor.userId : "user-other",
          organisationId: random() < 0.5 ? "org-a" : "org-b",
        },
        {
          type: "hotel",
          ownerUserId: actor.userId,
          organisationId: null,
        },
        {
          type: "booking",
          userId: random() < 0.5 ? actor.userId : "user-other",
          organisationId: random() < 0.5 ? "org-a" : "org-b",
        },
        { type: "organisation", id: random() < 0.5 ? "org-a" : "org-b" },
      ];

      for (const resource of resources) {
        for (const permission of allPermissions) {
          const actual = canWithPermissions(actor, permission, resource, lookup);
          expect(actual).toBe(expectedGrant(actor, permission, resource, lookup));
        }
      }
    }
  });

  it("denies every permission to an actor with no ownership and no memberships", () => {
    const actor: Actor = { userId: "lonely-user", role: "user" };
    const resources: Resource[] = [
      { type: "none" },
      { type: "hotel", organisationId: "org-a" },
      { type: "booking", userId: "someone-else", organisationId: "org-a" },
      { type: "organisation", id: "org-a" },
    ];

    for (const resource of resources) {
      for (const permission of allPermissions) {
        expect(canWithPermissions(actor, permission, resource, () => empty)).toBe(false);
      }
    }
  });

  it("never applies a membership in one organisation to another organisation", () => {
    const actor: Actor = { userId: "multi-org-user", role: "user" };
    const grants = new Map<string, ReadonlySet<Permission>>([
      ["org-a", ORGANISATION_ROLE_PERMISSIONS.owner!],
    ]);
    const lookup = (organisationId: string) => grants.get(organisationId) ?? empty;

    for (const permission of allPermissions) {
      expect(
        canWithPermissions(actor, permission, { type: "organisation", id: "org-b" }, lookup),
      ).toBe(false);
      expect(
        canWithPermissions(actor, permission, { type: "hotel", organisationId: "org-b" }, lookup),
      ).toBe(false);
    }
  });

  it("keeps role permissions monotonic across the seeded hierarchy", () => {
    const hierarchy = ["viewer", "member", "manager", "owner"] as const;

    for (let index = 1; index < hierarchy.length; index += 1) {
      const narrower = ORGANISATION_ROLE_PERMISSIONS[hierarchy[index - 1]!]!;
      const wider = ORGANISATION_ROLE_PERMISSIONS[hierarchy[index]!]!;
      for (const permission of narrower) {
        expect(wider.has(permission)).toBe(true);
      }
    }
  });
});
