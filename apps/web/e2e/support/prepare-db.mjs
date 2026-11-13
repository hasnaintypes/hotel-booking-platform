import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

/**
 * Rebuilds the disposable Playwright database before the suite:
 *   1. reset (drop/recreate the public schema, and create the database if needed)
 *   2. apply the drizzle migrations
 *   3. seed the deterministic fixtures (guest@user.com, Thames View Boutique, ...)
 *
 * It is deliberately part of `test:e2e` rather than of `pnpm test`, and it refuses to touch a
 * database whose name does not end in `_e2e` (see packages/db/scripts/reset-e2e-database.mjs).
 */
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");

const databaseUrl =
  process.env.E2E_DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/hotel_booking_e2e";
const seedPassword = process.env.E2E_SEED_PASSWORD ?? "e2e-playwright-password";

const run = (args, extraEnv) => {
  const result = spawnSync("pnpm", args, {
    cwd: repoRoot,
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: databaseUrl, ...extraEnv },
  });
  if (result.status !== 0) {
    console.error(`[e2e] failed: pnpm ${args.join(" ")}`);
    process.exit(result.status ?? 1);
  }
};

run(["--filter", "@hotel-booking/db", "db:reset:e2e"]);
run(["--filter", "@hotel-booking/db", "db:migrate"]);
run(["--filter", "@hotel-booking/api", "seed"], { SEED_PASSWORD: seedPassword });
