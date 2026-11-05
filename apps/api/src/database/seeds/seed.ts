/**
 * Seed deterministic PostgreSQL demo fixtures.
 *
 * Usage: SEED_PASSWORD='...' pnpm --filter @hotel-booking/api seed
 *
 * Local databases are allowed by default. Any non-local target also needs
 * ALLOW_SEED=true and SEED_DATABASE_NAME set to the exact disposable database name.
 */
import "dotenv/config";
import { assertSeedPassword, assertSeedTarget, createDb, seedDatabase } from "@hotel-booking/db";
import { hashPassword } from "../../common/security/password";

async function main(): Promise<void> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("Missing DATABASE_URL; the seed only targets PostgreSQL.");
  }

  const password = assertSeedPassword(process.env.SEED_PASSWORD);
  const target = assertSeedTarget({
    connectionString,
    allowSeed: process.env.ALLOW_SEED,
    seedDatabaseName: process.env.SEED_DATABASE_NAME,
  });

  const passwordHash = await hashPassword(password);
  const handle = createDb({ connectionString });

  try {
    const summary = await seedDatabase(handle.db, { passwordHash });
    console.log(
      `Seeded ${summary.users} users, ${summary.hotels} hotels, ${summary.bookings} bookings and ${summary.reviews} reviews into ${target.hostname}/${target.databaseName}.`,
    );
  } finally {
    await handle.close();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
