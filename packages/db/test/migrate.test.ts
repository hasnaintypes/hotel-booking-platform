import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { Client } from "pg";
import { describe, expect, it } from "vitest";

const url = process.env.TEST_DATABASE_URL;
const packageRoot = fileURLToPath(new URL("..", import.meta.url));

describe.skipIf(!url)("migrations", () => {
  it("applies to a fresh database and creates the users table", async () => {
    execFileSync("pnpm", ["db:migrate"], {
      cwd: packageRoot,
      env: { ...process.env, DATABASE_URL: url },
      stdio: "pipe",
    });

    const client = new Client({ connectionString: url });
    await client.connect();
    try {
      const result = await client.query<{ table: string | null }>(
        "SELECT to_regclass('public.users') AS table",
      );
      expect(result.rows[0]?.table).toBe("users");
    } finally {
      await client.end();
    }
  });
});
