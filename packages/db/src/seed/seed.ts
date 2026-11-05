import { eq, inArray } from "drizzle-orm";
import type { Database } from "../client.js";
import { bookings } from "../schema/bookings.js";
import { credentials } from "../schema/credentials.js";
import { facilities, hotelFacilities } from "../schema/facilities.js";
import { hotelHotelTypes, hotelTypes } from "../schema/hotel-types.js";
import { hotelImages } from "../schema/hotel-images.js";
import { hotels } from "../schema/hotels.js";
import { memberships } from "../schema/memberships.js";
import { organisations } from "../schema/organisations.js";
import { reviews } from "../schema/reviews.js";
import { users } from "../schema/users.js";
import {
  SEED_BOOKINGS,
  SEED_CREDENTIALS,
  SEED_FACILITIES,
  SEED_FIXTURE_IDS,
  SEED_HOTEL_FACILITIES,
  SEED_HOTEL_HOTEL_TYPES,
  SEED_HOTEL_IMAGES,
  SEED_HOTEL_TYPES,
  SEED_HOTELS,
  SEED_MEMBERSHIPS,
  SEED_ORGANISATIONS,
  SEED_REVIEWS,
  SEED_UUIDS,
  SEED_USERS,
} from "./fixtures.js";

export type SeedOptions = {
  /** A real bcrypt hash supplied by the CLI; never a plaintext password. */
  passwordHash: string;
};

export type SeedSummary = {
  users: number;
  hotels: number;
  bookings: number;
  reviews: number;
};

/**
 * Ensures the deterministic demo fixtures exist. Every insert is idempotent, so running the seed
 * twice leaves the same rows and does not rewrite timestamps or credentials.
 */
export async function seedDatabase(db: Database, options: SeedOptions): Promise<SeedSummary> {
  if (!options.passwordHash) {
    throw new Error("seedDatabase requires a password hash; set SEED_PASSWORD in the CLI.");
  }

  return db.transaction(async (tx) => {
    await tx.insert(users).values(SEED_USERS).onConflictDoNothing();
    await tx
      .insert(credentials)
      .values(SEED_CREDENTIALS(options.passwordHash))
      .onConflictDoNothing();
    await tx.insert(organisations).values(SEED_ORGANISATIONS).onConflictDoNothing();
    await tx.insert(memberships).values(SEED_MEMBERSHIPS).onConflictDoNothing();
    await tx.insert(facilities).values(SEED_FACILITIES).onConflictDoNothing();
    await tx.insert(hotelTypes).values(SEED_HOTEL_TYPES).onConflictDoNothing();
    await tx.insert(hotels).values(SEED_HOTELS).onConflictDoNothing();
    await tx.insert(hotelImages).values(SEED_HOTEL_IMAGES).onConflictDoNothing();
    await tx.insert(hotelFacilities).values(SEED_HOTEL_FACILITIES).onConflictDoNothing();
    await tx.insert(hotelHotelTypes).values(SEED_HOTEL_HOTEL_TYPES).onConflictDoNothing();
    await tx.insert(bookings).values(SEED_BOOKINGS).onConflictDoNothing();
    await tx.insert(reviews).values(SEED_REVIEWS).onConflictDoNothing();

    return {
      users: SEED_USERS.length,
      hotels: SEED_HOTELS.length,
      bookings: SEED_BOOKINGS.length,
      reviews: SEED_REVIEWS.length,
    };
  });
}

/**
 * Removes only the deterministic fixture rows, for tests and a deliberate demo reset. It never
 * truncates a table and leaves unrelated data alone.
 */
export async function deleteSeedFixtures(db: Database): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.delete(reviews).where(inArray(reviews.id, SEED_FIXTURE_IDS.reviews));
    await tx.delete(bookings).where(inArray(bookings.id, SEED_FIXTURE_IDS.bookings));
    await tx.delete(hotels).where(inArray(hotels.id, SEED_FIXTURE_IDS.hotels));
    await tx.delete(memberships).where(eq(memberships.organisationId, SEED_UUIDS.organisation));
    await tx.delete(organisations).where(eq(organisations.id, SEED_UUIDS.organisation));
    await tx.delete(credentials).where(inArray(credentials.userId, SEED_FIXTURE_IDS.users));
    await tx.delete(users).where(inArray(users.id, SEED_FIXTURE_IDS.users));
    await tx.delete(facilities).where(inArray(facilities.id, SEED_FIXTURE_IDS.facilities));
    await tx.delete(hotelTypes).where(inArray(hotelTypes.id, SEED_FIXTURE_IDS.hotelTypes));
  });
}
