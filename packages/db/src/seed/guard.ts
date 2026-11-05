const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]", "0.0.0.0"]);

export type SeedTarget = {
  hostname: string;
  databaseName: string;
};

export type SeedTargetOptions = {
  connectionString: string;
  allowSeed?: string | boolean;
  seedDatabaseName?: string;
};

const ALLOWANCE =
  "Set ALLOW_SEED=true and SEED_DATABASE_NAME to the exact disposable database name before seeding a non-local target.";

function parseConnectionString(connectionString: string): URL {
  try {
    return new URL(connectionString);
  } catch {
    throw new Error("DATABASE_URL is not a valid PostgreSQL connection string.");
  }
}

function databaseNameOf(url: URL): string {
  const databaseName = decodeURIComponent(url.pathname.replace(/^\/+/, ""));
  if (!databaseName) {
    throw new Error("DATABASE_URL must include an explicit database name; refusing to seed.");
  }
  return databaseName;
}

/**
 * Refuses to seed anything but a local database unless the caller explicitly opts in to one named
 * disposable database. A local host is safe by default because it cannot be shared production.
 */
export function assertSeedTarget({
  connectionString,
  allowSeed,
  seedDatabaseName,
}: SeedTargetOptions): SeedTarget {
  const url = parseConnectionString(connectionString);
  const hostname = url.hostname;
  const databaseName = databaseNameOf(url);

  if (LOCAL_HOSTS.has(hostname)) {
    return { hostname, databaseName };
  }

  const allowed = typeof allowSeed === "boolean" ? allowSeed : allowSeed?.toLowerCase() === "true";

  if (!allowed) {
    throw new Error(
      `Refusing to seed non-local database ${hostname}/${databaseName}. ${ALLOWANCE}`,
    );
  }

  if (!seedDatabaseName) {
    throw new Error(
      `Refusing to seed non-local database ${hostname}/${databaseName} without SEED_DATABASE_NAME. ${ALLOWANCE}`,
    );
  }

  if (seedDatabaseName !== databaseName) {
    throw new Error(
      `Refusing to seed ${hostname}/${databaseName}: SEED_DATABASE_NAME is "${seedDatabaseName}" but the target database is "${databaseName}".`,
    );
  }

  return { hostname, databaseName };
}

export const MIN_SEED_PASSWORD_LENGTH = 12;

/** Requires a demo password from the environment instead of shipping a weak default. */
export function assertSeedPassword(password: string | undefined): string {
  if (!password) {
    throw new Error(
      `Missing SEED_PASSWORD. Set a unique demo password of at least ${MIN_SEED_PASSWORD_LENGTH} characters; there is no default.`,
    );
  }

  if (password.length < MIN_SEED_PASSWORD_LENGTH) {
    throw new Error(
      `SEED_PASSWORD must be at least ${MIN_SEED_PASSWORD_LENGTH} characters; there is no default.`,
    );
  }

  return password;
}
