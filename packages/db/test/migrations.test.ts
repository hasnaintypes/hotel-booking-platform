import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { EXPECTED_MIGRATION_COUNT } from "../src/migrations.js";

describe("migration manifest", () => {
  it("keeps EXPECTED_MIGRATION_COUNT in step with the generated journal", () => {
    const journal = JSON.parse(
      readFileSync(
        fileURLToPath(new URL("../migrations/meta/_journal.json", import.meta.url)),
        "utf8",
      ),
    ) as { entries: unknown[] };

    expect(EXPECTED_MIGRATION_COUNT).toBe(journal.entries.length);
  });
});
