import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createDb,
  DEFAULT_EXCHANGE_RATE_MAX_AGE_MS,
  lookupExchangeRate,
  selectApplicableRate,
  type Database,
  type DatabaseHandle,
  type RateCandidate,
} from "../src/index.js";
import { exchangeRates } from "../src/schema/exchange-rates.js";

const url = process.env.TEST_DATABASE_URL;
const packageRoot = fileURLToPath(new URL("..", import.meta.url));

type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

const rate = (overrides: Partial<RateCandidate> & Pick<RateCandidate, "id">): RateCandidate => ({
  baseCode: "GBP",
  quoteCode: "USD",
  rate: "1.25",
  source: "test",
  observedAt: new Date("2026-01-01T00:00:00Z"),
  validFrom: new Date("2026-01-01T00:00:00Z"),
  validTo: null,
  createdAt: new Date("2026-01-01T00:00:00Z"),
  ...overrides,
});

describe("exchange rate selection", () => {
  const at = new Date("2026-01-03T00:00:00Z");

  it("returns the latest applicable rate", () => {
    const result = selectApplicableRate(
      [
        rate({ id: "old", rate: "1.20" }),
        rate({
          id: "new",
          rate: "1.30",
          observedAt: new Date("2026-01-02T00:00:00Z"),
          validFrom: new Date("2026-01-02T00:00:00Z"),
        }),
      ],
      at,
      48 * 60 * 60 * 1_000,
    );

    expect(result).toMatchObject({
      status: "found",
      exchangeRateId: "new",
      rate: "1.30",
    });
  });

  it("ignores rates that are not valid yet or have expired", () => {
    const result = selectApplicableRate(
      [
        rate({ id: "future", validFrom: new Date("2026-01-04T00:00:00Z") }),
        rate({ id: "expired", validTo: new Date("2026-01-02T00:00:00Z") }),
      ],
      at,
    );

    expect(result).toEqual({ status: "missing" });
  });

  it("marks a rate stale when it is older than the limit", () => {
    const result = selectApplicableRate([rate({ id: "old" })], at);

    expect(result).toMatchObject({
      status: "stale",
      exchangeRateId: "old",
      ageMs: 2 * 24 * 60 * 60 * 1_000,
    });
  });

  it("accepts a rate observed within the staleness limit", () => {
    const result = selectApplicableRate(
      [
        rate({
          id: "fresh",
          observedAt: new Date("2026-01-02T12:00:00Z"),
          validFrom: new Date("2026-01-02T12:00:00Z"),
        }),
      ],
      at,
    );

    expect(result).toMatchObject({ status: "found", exchangeRateId: "fresh" });
  });

  it("uses a 24 hour default staleness limit", () => {
    const result = selectApplicableRate(
      [
        rate({
          id: "just-over",
          observedAt: new Date(at.getTime() - DEFAULT_EXCHANGE_RATE_MAX_AGE_MS - 1),
          validFrom: new Date(at.getTime() - DEFAULT_EXCHANGE_RATE_MAX_AGE_MS - 1),
        }),
      ],
      at,
    );

    expect(result.status).toBe("stale");
  });

  it("returns the identity rate for a same-currency lookup without querying", async () => {
    const unusedDatabase = new Proxy(
      {},
      {
        get() {
          throw new Error("same-currency lookup must not touch the database");
        },
      },
    ) as Database;

    const result = await lookupExchangeRate(unusedDatabase, {
      baseCode: "GBP",
      quoteCode: "GBP",
    });

    expect(result).toMatchObject({ status: "found", rate: "1", source: "identity", ageMs: 0 });
  });
});

describe.skipIf(!url)("exchange rate lookup on PostgreSQL", () => {
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

  const insertRate = async (
    tx: Transaction,
    input: {
      rate: string;
      observedAt: string;
      validFrom: string;
      validTo?: string;
      source?: string;
    },
  ) => {
    const [row] = await tx
      .insert(exchangeRates)
      .values({
        baseCode: "GBP",
        quoteCode: "USD",
        rate: input.rate,
        source: input.source ?? "test",
        observedAt: new Date(input.observedAt),
        validFrom: new Date(input.validFrom),
        validTo: input.validTo ? new Date(input.validTo) : null,
      })
      .returning({ id: exchangeRates.id });
    return row!.id;
  };

  it("selects the latest valid rate and reports staleness", async () => {
    await inRollback(async (tx) => {
      const oldId = await insertRate(tx, {
        rate: "1.20",
        observedAt: "2026-01-01T00:00:00Z",
        validFrom: "2026-01-01T00:00:00Z",
      });
      const newId = await insertRate(tx, {
        rate: "1.30",
        observedAt: "2026-01-02T00:00:00Z",
        validFrom: "2026-01-02T00:00:00Z",
      });

      const fresh = await lookupExchangeRate(tx, {
        baseCode: "GBP",
        quoteCode: "USD",
        at: new Date("2026-01-03T00:00:00Z"),
        maxAgeMs: 48 * 60 * 60 * 1_000,
      });
      expect(fresh).toMatchObject({ status: "found", exchangeRateId: newId, rate: "1.30000000" });

      const stale = await lookupExchangeRate(tx, {
        baseCode: "GBP",
        quoteCode: "USD",
        at: new Date("2026-01-10T00:00:00Z"),
      });
      expect(stale).toMatchObject({ status: "stale", exchangeRateId: newId });

      expect(oldId).not.toBe(newId);
    });
  });

  it("returns missing when no rate is valid at the requested time", async () => {
    await inRollback(async (tx) => {
      await insertRate(tx, {
        rate: "1.20",
        observedAt: "2026-01-01T00:00:00Z",
        validFrom: "2026-01-05T00:00:00Z",
      });

      const result = await lookupExchangeRate(tx, {
        baseCode: "GBP",
        quoteCode: "USD",
        at: new Date("2026-01-03T00:00:00Z"),
      });

      expect(result).toEqual({ status: "missing" });
    });
  });

  it("ignores a rate whose validity window has ended", async () => {
    await inRollback(async (tx) => {
      await insertRate(tx, {
        rate: "1.20",
        observedAt: "2026-01-01T00:00:00Z",
        validFrom: "2026-01-01T00:00:00Z",
        validTo: "2026-01-02T00:00:00Z",
      });

      const result = await lookupExchangeRate(tx, {
        baseCode: "GBP",
        quoteCode: "USD",
        at: new Date("2026-01-03T00:00:00Z"),
      });

      expect(result).toEqual({ status: "missing" });
    });
  });
});
