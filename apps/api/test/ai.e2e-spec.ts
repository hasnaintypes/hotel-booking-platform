import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestApp, type TestApp } from "./support/create-app";
import { anonymous, registerAdmin, registerUser } from "./support/helpers";
import { routes } from "./support/routes";

// Built from code points so this file contains no invisible characters.
const NUL = String.fromCharCode(0x00);
const RLO = String.fromCharCode(0x202e);

const withEnv = (values: Record<string, string>) => {
  const previous: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(values)) {
    previous[key] = process.env[key];
    process.env[key] = value;
  }
  return () => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  };
};

const draft = (kind: string, input: unknown) => ({ kind, input });

describe("AI suggestions when the feature is off", () => {
  let t: TestApp;
  let user: Awaited<ReturnType<typeof registerUser>>;

  beforeAll(async () => {
    t = await createTestApp();
    user = await registerUser(t);
  });
  afterAll(async () => {
    await t.close();
  });

  it("is off by default and answers 503", async () => {
    const res = await user.agent
      .post(routes.ai.suggest)
      .send(draft("hotel_description", "A hotel"));
    expect(res.status).toBe(503);
    expect(res.body.code).toBe("SERVICE_UNAVAILABLE");
  });

  it("still requires a signed-in user", async () => {
    const res = await anonymous(t).post(routes.ai.suggest).send(draft("hotel_description", "A"));
    expect(res.status).toBe(401);
  });
});

describe("AI suggestions when enabled", () => {
  let t: TestApp;
  let restoreEnv: () => void;
  let user: Awaited<ReturnType<typeof registerUser>>;
  let admin: Awaited<ReturnType<typeof registerAdmin>>;

  beforeAll(async () => {
    restoreEnv = withEnv({
      AI_ASSIST_ENABLED: "true",
      AI_PER_MINUTE_LIMIT: "100",
      LOG_LEVEL: "debug",
    });
    t = await createTestApp();
    user = await registerUser(t);
    admin = await registerAdmin(t);
  });
  afterAll(async () => {
    await t.close();
    restoreEnv();
  });

  const suggest = (agent: typeof user.agent, body: unknown) =>
    agent.post(routes.ai.suggest).send(body as object);

  it("drafts a hotel description for any signed-in user, including one with no hotels", async () => {
    const res = await suggest(user.agent, draft("hotel_description", "cosy seaside inn"));

    expect(res.status).toBe(200);
    expect(res.body.provider).toBe("stub");
    expect(res.body.draft).toContain("Cosy seaside inn");
  });

  it("reserves insights copy for admins", async () => {
    const refused = await suggest(user.agent, draft("insights_copy", "bookings are up"));
    expect(refused.status).toBe(403);
    expect(refused.body.code).toBe("FORBIDDEN");

    const allowed = await suggest(admin.agent, draft("insights_copy", "bookings are up"));
    expect(allowed.status).toBe(200);
  });

  it.each([
    ["an empty input", draft("hotel_description", ""), "input"],
    ["a blank input", draft("hotel_description", "   \n  "), "input"],
    ["an input over 2000 characters", draft("hotel_description", "x".repeat(2001)), "input"],
    ["a missing input", { kind: "hotel_description" }, "input"],
    ["an input that is not text", draft("hotel_description", { $ne: null }), "input"],
    ["an unknown kind", draft("poem", "A hotel"), "kind"],
    ["a missing kind", { input: "A hotel" }, "kind"],
  ])("rejects %s with a field-level 400", async (_name, body, field) => {
    const res = await suggest(user.agent, body);
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("VALIDATION_FAILED");
    expect(res.body.errors.map((e: { field: string }) => e.field)).toContain(field);
  });

  it("accepts an input of exactly 2000 characters", async () => {
    const res = await suggest(user.agent, draft("hotel_description", "x".repeat(2000)));
    expect(res.status).toBe(200);
  });

  it("returns plain text with control characters removed", async () => {
    const res = await suggest(user.agent, draft("hotel_description", `calm${NUL} inn${RLO}`));

    expect(res.status).toBe(200);
    expect(res.body.draft).not.toContain(NUL);
    expect(res.body.draft).not.toContain(RLO);
    expect(res.headers["content-type"]).toMatch(/application\/json/);
  });

  it("does not write the prompt or the draft to the logs", async () => {
    t.logs.clear();
    await suggest(user.agent, draft("hotel_description", "UNIQUE-PROMPT-MARKER-8842"));

    expect(t.logs.raw()).not.toContain("UNIQUE-PROMPT-MARKER-8842");
  });

  it("does not save anything: it only returns text", async () => {
    const before = await t.connection.collection("hotels").countDocuments();
    await suggest(user.agent, draft("hotel_description", "A hotel"));
    expect(await t.connection.collection("hotels").countDocuments()).toBe(before);
  });
});

describe("AI usage limits", () => {
  let t: TestApp;
  let restoreEnv: () => void;
  let first: Awaited<ReturnType<typeof registerUser>>;
  let second: Awaited<ReturnType<typeof registerUser>>;

  beforeAll(async () => {
    restoreEnv = withEnv({
      AI_ASSIST_ENABLED: "true",
      AI_DAILY_QUOTA: "3",
      AI_PER_MINUTE_LIMIT: "2",
    });
    t = await createTestApp();
    first = await registerUser(t);
    second = await registerUser(t);
  });
  afterAll(async () => {
    await t.close();
    restoreEnv();
  });

  const ask = (agent: typeof first.agent) =>
    agent.post(routes.ai.suggest).send(draft("hotel_description", "A hotel"));

  it("refuses requests over the per-minute limit with a Retry-After", async () => {
    expect((await ask(first.agent)).status).toBe(200);
    expect((await ask(first.agent)).status).toBe(200);

    const res = await ask(first.agent);

    expect(res.status).toBe(429);
    expect(res.body.code).toBe("TOO_MANY_REQUESTS");
    expect(Number(res.headers["retry-after"])).toBeGreaterThan(0);
    expect(Number(res.headers["retry-after"])).toBeLessThanOrEqual(60);
  });

  it("limits each user separately", async () => {
    expect((await ask(second.agent)).status).toBe(200);
  });

  it("does not charge a request that fails validation against the limits", async () => {
    const third = await registerUser(t);
    for (let i = 0; i < 5; i += 1) {
      const bad = await third.agent.post(routes.ai.suggest).send(draft("hotel_description", ""));
      expect(bad.status).toBe(400);
    }
    expect((await ask(third.agent)).status).toBe(200);
  });
});
