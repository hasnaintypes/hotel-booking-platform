import { randomUUID } from "node:crypto";
import { Controller, Inject, Post } from "@nestjs/common";
import { ModuleRef } from "@nestjs/core";
import { eq } from "drizzle-orm";
import { PinoLogger } from "nestjs-pino";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { outboxEvents, type Database } from "@hotel-booking/db";
import { currentRequestId } from "../src/common/logging/request-context";
import { DATABASE } from "../src/database/postgres.database";
import type { JobQueue } from "../src/domain/jobs/job-queue";
import { JOB_NAMES } from "../src/modules/jobs/job-names";
import { JOB_QUEUE } from "../src/modules/jobs/job-queue.settings";
import { createTestApp, type TestApp } from "./support/create-app";
import { anonymous } from "./support/helpers";

/**
 * Test-only endpoint that writes an outbox row from inside an HTTP request, which is the shape a
 * real business transaction has. Production code does not need it: it exists to prove that the
 * request id survives the HTTP boundary, the outbox and the job runner.
 */
@Controller("test/correlation")
class CorrelationController {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly moduleRef: ModuleRef,
  ) {}

  @Post("enqueue")
  async enqueue() {
    // Resolved lazily because a controller mounted on the test root module cannot inject a
    // provider that only `JobsModule` exports.
    const queue = this.moduleRef.get<JobQueue>(JOB_QUEUE, { strict: false });
    const outboxId = await this.db.transaction((tx) =>
      queue.enqueueInTransaction(tx, JOB_NAMES.expirePendingBookings, {}),
    );
    return { outboxId, requestId: currentRequestId() };
  }
}

const waitFor = async (predicate: () => boolean, timeoutMs = 20_000) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`condition not met within ${timeoutMs}ms`);
};

describe("request correlation", () => {
  let t: TestApp;
  let queue: JobQueue;
  let db: Database;

  beforeAll(async () => {
    process.env.LOG_LEVEL = "debug";
    t = await createTestApp({ controllers: [CorrelationController] });
    queue = t.app.get<JobQueue>(JOB_QUEUE);
    db = t.app.get<Database>(DATABASE);
  });

  afterAll(async () => {
    await queue?.stop();
    await t?.close();
    delete process.env.LOG_LEVEL;
  });

  it("carries one request id from the HTTP request through the outbox and the job handler", async () => {
    const requestId = "edge-correlation-1234";
    let handlerRequestId: string | undefined;
    let handlerRan = false;
    const handlerLogger = await t.app.resolve(PinoLogger);
    handlerLogger.setContext("CorrelationHandler");

    await queue.handle(JOB_NAMES.expirePendingBookings, async () => {
      handlerRequestId = currentRequestId();
      handlerLogger.info("correlation handler ran");
      handlerRan = true;
    });

    const response = await anonymous(t)
      .post("/api/v1/test/correlation/enqueue")
      .set("X-Request-Id", requestId);

    expect(response.status, JSON.stringify(response.body)).toBe(201);
    expect(response.headers["x-request-id"]).toBe(requestId);
    expect(response.body).toEqual({ outboxId: expect.any(String), requestId });

    const [row] = await db
      .select()
      .from(outboxEvents)
      .where(eq(outboxEvents.id, response.body.outboxId));
    expect(row.payload).toEqual({ requestId });

    await queue.startWorker();
    await waitFor(() => handlerRan);

    expect(handlerRequestId).toBe(requestId);
    const lines = t.logs.lines();
    const handlerLine = lines.find((entry) => entry.msg === "correlation handler ran");
    expect(handlerLine, "no log line from the job handler").toBeDefined();
    expect(handlerLine?.requestId).toBe(requestId);

    const accessLine = lines.find(
      (entry) =>
        "responseTime" in entry &&
        entry.path === "/api/v1/test/correlation/enqueue" &&
        entry.method === "POST",
    );
    expect(accessLine?.requestId).toBe(requestId);

    await queue.stop();
    await db.delete(outboxEvents).where(eq(outboxEvents.id, response.body.outboxId));
  });

  it("generates an id when the client does not send one", async () => {
    const response = await anonymous(t).post("/api/v1/test/correlation/enqueue");

    expect(response.status).toBe(201);
    expect(response.headers["x-request-id"]).toMatch(/^[0-9a-f-]{36}$/);
    expect(response.body.requestId).toBe(response.headers["x-request-id"]);

    await db.delete(outboxEvents).where(eq(outboxEvents.id, response.body.outboxId));
  });

  it("exposes Prometheus metrics with route templates, not concrete ids", async () => {
    const hotelId = randomUUID();
    const correlationId = "metrics-scrape-1234";

    await anonymous(t).get(`/api/v1/hotels/${hotelId}`).set("X-Request-Id", correlationId);

    const scrape = await anonymous(t).get("/metrics");

    expect(scrape.status).toBe(200);
    expect(scrape.headers["content-type"]).toContain("text/plain");
    expect(scrape.text).toContain("hotel_booking_http_requests_total");
    expect(scrape.text).toContain('route="/api/v1/hotels/:id"');
    // The concrete id must never become a label value.
    expect(scrape.text).not.toContain(hotelId);
  });

  it("keeps the scrape endpoint outside the versioned API", async () => {
    const versioned = await anonymous(t).get("/api/v1/metrics");

    expect(versioned.status).toBe(404);
  });
});
