import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createDb, type DatabaseHandle } from "@hotel-booking/db";
import { mapException } from "../../common/errors/exception-mapper";
import { UniqueViolationError } from "../../common/errors/postgres-errors";
import { UsersRepository } from "./users.repository";

const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)("UsersRepository against PostgreSQL", () => {
  let handle: DatabaseHandle;
  let repository: UsersRepository;
  const emails: string[] = [];

  const email = () => {
    const value = `repo-${randomUUID()}@example.com`;
    emails.push(value);
    return value;
  };

  beforeAll(() => {
    handle = createDb({ connectionString: url! });
    repository = new UsersRepository(handle.db);
  });

  afterEach(async () => {
    for (const value of emails.splice(0)) {
      await repository.deleteByEmail(value);
    }
  });

  afterAll(async () => {
    await handle.close();
  });

  it("inserts and finds a user by email", async () => {
    const value = email();

    const created = await repository.create({ email: value });
    expect(created.email).toBe(value);

    await expect(repository.findByEmail(value)).resolves.toMatchObject({ id: created.id });
  });

  it("returns one success and one typed 409 when two inserts race on the unique email", async () => {
    const value = email();

    const results = await Promise.allSettled([
      repository.create({ email: value }),
      repository.create({ email: value }),
    ]);

    const fulfilled = results.filter((result) => result.status === "fulfilled");
    const rejected = results.filter((result) => result.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);

    const error = (rejected[0] as PromiseRejectedResult).reason;
    expect(error).toBeInstanceOf(UniqueViolationError);
    expect(mapException(error)).toMatchObject({ status: 409, code: "CONFLICT" });
  });
});
