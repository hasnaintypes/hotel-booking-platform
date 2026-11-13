/**
 * Empties the disposable Playwright database so every run starts from the seeded fixtures.
 *
 * Safety: the target database name must end in `_e2e` and contain only lowercase letters, digits
 * and underscores. The script is intentionally not wired into `pnpm db:*` at the root; only
 * `apps/web/e2e/support/prepare-db.mjs` calls it.
 */
import pg from "pg";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("Missing DATABASE_URL; db:reset:e2e only targets the disposable e2e database.");
}

let target;
try {
  target = new URL(connectionString);
} catch {
  throw new Error("DATABASE_URL is not a valid PostgreSQL connection string.");
}

const databaseName = decodeURIComponent(target.pathname.replace(/^\/+/, ""));
if (!/^[a-z0-9_]+_e2e$/.test(databaseName)) {
  throw new Error(
    `Refusing to reset "${databaseName}": the name must match ^[a-z0-9_]+_e2e$. ` +
      "Set E2E_DATABASE_URL to the disposable Playwright database.",
  );
}

const maintenanceUrl = new URL(connectionString);
maintenanceUrl.pathname = "/postgres";

const maintenance = new pg.Client({ connectionString: maintenanceUrl.toString() });
await maintenance.connect();
try {
  const existing = await maintenance.query("select 1 from pg_database where datname = $1", [
    databaseName,
  ]);
  if (existing.rowCount === 0) {
    // The identifier is validated above; CREATE DATABASE cannot take a bind parameter.
    await maintenance.query(`CREATE DATABASE "${databaseName}"`);
    console.log(`[e2e] created database ${databaseName}`);
  }
} finally {
  await maintenance.end();
}

const targetClient = new pg.Client({ connectionString });
await targetClient.connect();
try {
  await targetClient.query(
    "drop schema if exists drizzle cascade; drop schema if exists public cascade; create schema public;",
  );
} finally {
  await targetClient.end();
}

console.log(`[e2e] reset ${target.hostname}/${databaseName}`);
