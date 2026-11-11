import { inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb, type Database, type DatabaseHandle } from "../src/client.js";
import { bookings } from "../src/schema/bookings.js";
import { credentials } from "../src/schema/credentials.js";
import { facilities, hotelFacilities } from "../src/schema/facilities.js";
import { hotelHotelTypes, hotelTypes } from "../src/schema/hotel-types.js";
import { hotelImages } from "../src/schema/hotel-images.js";
import { hotels } from "../src/schema/hotels.js";
import { memberships } from "../src/schema/memberships.js";
import { organisations } from "../src/schema/organisations.js";
import { reviews } from "../src/schema/reviews.js";
import { users } from "../src/schema/users.js";
import { SEED_FACILITIES, SEED_FIXTURE_IDS, SEED_HOTEL_TYPES } from "../src/seed/fixtures.js";
import { deleteSeedFixtures, seedDatabase } from "../src/seed/seed.js";

const url = process.env.TEST_DATABASE_URL;
const passwordHash = "$2b$12$seedfixturesonlynotarealhash";

const snapshot = async (db: Database) => {
  const [userRows, credentialRows, organisationRows, membershipRows, hotelRows, imageRows] =
    await Promise.all([
      db.select().from(users).where(inArray(users.id, SEED_FIXTURE_IDS.users)).orderBy(users.email),
      db
        .select()
        .from(credentials)
        .where(inArray(credentials.userId, SEED_FIXTURE_IDS.users))
        .orderBy(credentials.userId),
      db.select().from(organisations).orderBy(organisations.id),
      db.select().from(memberships).orderBy(memberships.organisationId),
      db
        .select()
        .from(hotels)
        .where(inArray(hotels.id, SEED_FIXTURE_IDS.hotels))
        .orderBy(hotels.id),
      db
        .select()
        .from(hotelImages)
        .where(inArray(hotelImages.hotelId, SEED_FIXTURE_IDS.hotels))
        .orderBy(hotelImages.id),
    ]);

  const [facilityRows, hotelFacilityRows, hotelTypeRows, bookingRows, reviewRows] =
    await Promise.all([
      db
        .select()
        .from(facilities)
        .where(inArray(facilities.id, SEED_FIXTURE_IDS.facilities))
        .orderBy(facilities.id),
      db
        .select()
        .from(hotelFacilities)
        .where(inArray(hotelFacilities.hotelId, SEED_FIXTURE_IDS.hotels))
        .orderBy(hotelFacilities.hotelId, hotelFacilities.facilityId),
      db
        .select()
        .from(hotelHotelTypes)
        .where(inArray(hotelHotelTypes.hotelId, SEED_FIXTURE_IDS.hotels))
        .orderBy(hotelHotelTypes.hotelId, hotelHotelTypes.hotelTypeId),
      db
        .select()
        .from(bookings)
        .where(inArray(bookings.id, SEED_FIXTURE_IDS.bookings))
        .orderBy(bookings.id),
      db
        .select()
        .from(reviews)
        .where(inArray(reviews.id, SEED_FIXTURE_IDS.reviews))
        .orderBy(reviews.id),
    ]);

  return {
    users: userRows,
    credentials: credentialRows,
    organisations: organisationRows,
    memberships: membershipRows,
    hotels: hotelRows,
    images: imageRows,
    facilities: facilityRows,
    hotelFacilities: hotelFacilityRows,
    hotelHotelTypes: hotelTypeRows,
    bookings: bookingRows,
    reviews: reviewRows,
  };
};

describe.skipIf(!url)("PostgreSQL seed fixtures", () => {
  let handle: DatabaseHandle;

  beforeAll(async () => {
    handle = createDb({ connectionString: url! });
    await deleteSeedFixtures(handle.db);
    // The shared test database also hosts the API suite, which creates hotels and therefore
    // facility and hotel-type vocabulary rows with random ids. Those rows collide with the
    // fixture codes, and the seed's `on conflict do nothing` would then skip the fixture row,
    // so clear the vocabulary the fixtures own before asserting on their fixed ids.
    await handle.db.delete(facilities).where(
      inArray(
        facilities.code,
        SEED_FACILITIES.map((row) => row.code),
      ),
    );
    await handle.db.delete(hotelTypes).where(
      inArray(
        hotelTypes.code,
        SEED_HOTEL_TYPES.map((row) => row.code),
      ),
    );
  });

  afterAll(async () => {
    await deleteSeedFixtures(handle.db);
    await handle.close();
  });

  it("inserts the same deterministic rows on repeat runs", async () => {
    const first = await seedDatabase(handle.db, { passwordHash });
    expect(first).toEqual({ users: 4, hotels: 3, bookings: 6, reviews: 2 });

    const firstSnapshot = await snapshot(handle.db);
    expect(firstSnapshot.users).toHaveLength(4);
    expect(firstSnapshot.credentials).toHaveLength(4);
    expect(firstSnapshot.organisations).toHaveLength(1);
    expect(firstSnapshot.memberships).toHaveLength(1);
    expect(firstSnapshot.hotels).toHaveLength(3);
    expect(firstSnapshot.images).toHaveLength(6);
    expect(firstSnapshot.facilities).toHaveLength(6);
    expect(firstSnapshot.hotelFacilities).toHaveLength(9);
    expect(firstSnapshot.hotelHotelTypes).toHaveLength(5);
    expect(firstSnapshot.bookings).toHaveLength(6);
    expect(firstSnapshot.reviews).toHaveLength(2);
    expect(firstSnapshot.credentials.every((row) => row.passwordHash === passwordHash)).toBe(true);

    await seedDatabase(handle.db, { passwordHash });
    const secondSnapshot = await snapshot(handle.db);

    expect(secondSnapshot).toEqual(firstSnapshot);
  });
});
