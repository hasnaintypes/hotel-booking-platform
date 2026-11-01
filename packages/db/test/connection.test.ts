import { describe, expect, it } from "vitest";
import { createDb } from "../src/index";

const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)("database connection", () => {
  it("runs SELECT 1 through the shared client", async () => {
    const handle = createDb({ connectionString: url!, maxConnections: 1 });
    try {
      const result = await handle.pool.query<{ ok: number }>("SELECT 1 AS ok");
      expect(result.rows[0]?.ok).toBe(1);
    } finally {
      await handle.close();
    }
  });
});
