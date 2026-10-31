import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestApp, type TestApp } from "./support/create-app";
import { anonymous } from "./support/helpers";
import { routes } from "./support/routes";

const PROBLEM_JSON = /application\/problem\+json/;

describe("error responses (problem details)", () => {
  let t: TestApp;
  beforeAll(async () => {
    process.env.LOG_LEVEL = "debug";
    t = await createTestApp({ faults: true });
  });
  afterAll(async () => {
    await t.close();
    delete process.env.LOG_LEVEL;
  });

  const expectProblem = (
    res: { status: number; headers: Record<string, string>; body: any },
    status: number,
    code: string,
  ) => {
    expect(res.status).toBe(status);
    expect(res.headers["content-type"]).toMatch(PROBLEM_JSON);
    expect(res.body).toMatchObject({ status, code });
    expect(res.body.type).toBe(
      `urn:hotel-booking:problem:${code.toLowerCase().replace(/_/g, "-")}`,
    );
    expect(typeof res.body.title).toBe("string");
    expect(typeof res.body.detail).toBe("string");
    expect(res.body.message).toBe(res.body.detail);
    expect(res.body.instance).toMatch(/^\//);
    expect(res.body.requestId).toBe(res.headers["x-request-id"]);
  };

  it("returns 404 problem details for unmatched routes", async () => {
    const res = await anonymous(t).get("/api/does-not-exist");
    expectProblem(res, 404, "NOT_FOUND");
  });

  it("returns 401 problem details for missing authentication", async () => {
    const res = await anonymous(t).get(routes.users.me);
    expectProblem(res, 401, "UNAUTHENTICATED");
  });

  it("returns 400 with per-field errors for DTO validation failures", async () => {
    const res = await anonymous(t).post("/__test__/echo").send({ email: "nope", count: 0 });
    expectProblem(res, 400, "VALIDATION_FAILED");
    const fields = res.body.errors.map((e: { field: string }) => e.field).sort();
    expect(fields).toEqual(["count", "email"]);
  });

  it("returns 400 INVALID_JSON for a malformed JSON body", async () => {
    const res = await anonymous(t)
      .post("/__test__/echo")
      .set("Content-Type", "application/json")
      .send("{ not json");
    expectProblem(res, 400, "INVALID_JSON");
  });

  it("correlates and logs requests rejected before routing (malformed JSON, CORS)", async () => {
    t.logs.clear();
    const json = await anonymous(t)
      .post("/__test__/echo")
      .set("Content-Type", "application/json")
      .send("{ not json");
    const cors = await anonymous(t).get(routes.health).set("Origin", "https://evil.example");

    for (const [res, code] of [
      [json, "INVALID_JSON"],
      [cors, "CORS_ORIGIN_NOT_ALLOWED"],
    ] as const) {
      expect(res.body.code).toBe(code);
      expect(res.body.requestId).toBe(res.headers["x-request-id"]);
      const logged = t.logs
        .lines()
        .find((l) => l.requestId === res.body.requestId && /rejected before routing/.test(l.msg));
      expect(logged).toMatchObject({ level: "warn", code, status: res.status });
    }
  });

  it("returns 413 for oversized JSON bodies", async () => {
    const res = await anonymous(t)
      .post("/__test__/echo")
      .send({ email: "a@b.test", count: 1, padding: "x".repeat(300_000) });
    expectProblem(res, 413, "PAYLOAD_TOO_LARGE");
  });

  it("returns 400 INVALID_ID for malformed resource identifiers", async () => {
    const res = await anonymous(t).get(routes.hotels.byId("not-an-object-id"));
    expectProblem(res, 400, "INVALID_ID");
  });

  it.each([
    ["/__test__/mongo-duplicate", 409, "CONFLICT"],
    ["/__test__/cast-error", 400, "INVALID_ID"],
    ["/__test__/stripe-card", 402, "PAYMENT_DECLINED"],
    ["/__test__/stripe-down", 502, "UPSTREAM_ERROR"],
    ["/__test__/throttled", 429, "TOO_MANY_REQUESTS"],
    ["/__test__/teapot", 418, "BAD_REQUEST"],
  ])("maps %s deliberately", async (path, status, code) => {
    expectProblem(await anonymous(t).get(path), status, code);
  });

  it("returns a generic 500 for unexpected errors without leaking internals", async () => {
    t.logs.clear();
    const res = await anonymous(t).get("/__test__/boom");
    expectProblem(res, 500, "INTERNAL_ERROR");

    const serialized = JSON.stringify(res.body);
    expect(serialized).not.toMatch(/hunter2|mongodb:|internal-db|stack|at /);

    // The real cause is logged server-side, correlated by request id.
    const logged = t.logs
      .lines()
      .find((l) => l.level === "error" && String(l.msg).includes("INTERNAL_ERROR"));
    expect(logged).toBeDefined();
    expect(logged!.requestId).toBe(res.body.requestId);
    // The cause is kept for operators, but credentials in URLs are scrubbed from logs.
    expect(logged!.err.message).toContain("connection failed");
    expect(t.logs.raw()).not.toContain("hunter2");
    expect(logged!.err.message).toContain("mongodb://[Redacted]@internal-db");
  });

  it("does not return a stack trace for any error class", async () => {
    for (const path of ["/__test__/boom", "/__test__/stripe-down", "/api/does-not-exist"]) {
      const res = await anonymous(t).get(path);
      expect(JSON.stringify(res.body)).not.toMatch(/\bat \S+ \(/);
    }
  });
});
