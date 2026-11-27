import { Injectable } from "@nestjs/common";
import { collectDefaultMetrics, Counter, Gauge, Histogram, Registry } from "@prometheus-io/client";
import type { JobQueue, JobQueueMetrics } from "../../domain/jobs/job-queue";

const LATENCY_BUCKETS = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10];
const METRIC_PREFIX = "hotel_booking_";

export type HttpObservation = {
  method: string;
  /** The route template (`/api/v1/hotels/:id`), or `unmatched`, never a raw path. */
  route: string;
  status: number;
  seconds: number;
};

/**
 * The process's Prometheus instruments. Labels are deliberately low-cardinality: route templates
 * rather than concrete paths, a small status/outcome vocabulary, and queue names from the
 * configured set. Nothing here is per-user or per-booking.
 */
@Injectable()
export class MetricsService {
  readonly registry = new Registry();

  private readonly httpDuration: Histogram<"method" | "route" | "status">;
  private readonly httpRequests: Counter<"method" | "route" | "status">;
  private readonly unhandledErrors: Counter<"code" | "status">;
  private readonly queueJobs: Gauge<"queue" | "state">;
  private readonly queueOldestReady: Gauge<"queue">;
  private readonly outboxEvents: Gauge<"state">;
  private readonly outboxOldestPending: Gauge;
  private readonly stripeCalls: Counter<"operation" | "outcome">;
  private readonly stripeDuration: Histogram<"operation">;
  private readonly supplierDuration: Histogram<"supplier">;

  constructor() {
    this.registry.setDefaultLabels({ service: "hotel-booking-api" });
    collectDefaultMetrics({ register: this.registry, prefix: METRIC_PREFIX });

    this.httpDuration = new Histogram({
      name: `${METRIC_PREFIX}http_request_duration_seconds`,
      help: "HTTP request duration in seconds, by method, route template and status",
      labelNames: ["method", "route", "status"],
      buckets: LATENCY_BUCKETS,
      registers: [this.registry],
    });
    this.httpRequests = new Counter({
      name: `${METRIC_PREFIX}http_requests_total`,
      help: "HTTP requests by method, route template and status",
      labelNames: ["method", "route", "status"],
      registers: [this.registry],
    });
    this.unhandledErrors = new Counter({
      name: `${METRIC_PREFIX}unhandled_errors_total`,
      help: "Errors answered with a 5xx problem, by stable error code",
      labelNames: ["code", "status"],
      registers: [this.registry],
    });
    this.queueJobs = new Gauge({
      name: `${METRIC_PREFIX}job_queue_jobs`,
      help: "Jobs in each queue state",
      labelNames: ["queue", "state"],
      registers: [this.registry],
    });
    this.queueOldestReady = new Gauge({
      name: `${METRIC_PREFIX}job_queue_oldest_ready_seconds`,
      help: "Age of the oldest ready job in a queue",
      labelNames: ["queue"],
      registers: [this.registry],
    });
    this.outboxEvents = new Gauge({
      name: `${METRIC_PREFIX}outbox_events`,
      help: "Outbox rows in each state",
      labelNames: ["state"],
      registers: [this.registry],
    });
    this.outboxOldestPending = new Gauge({
      name: `${METRIC_PREFIX}outbox_oldest_pending_seconds`,
      help: "Age of the oldest outbox row waiting to be relayed",
      registers: [this.registry],
    });
    this.stripeCalls = new Counter({
      name: `${METRIC_PREFIX}stripe_calls_total`,
      help: "Stripe API calls by operation and outcome",
      labelNames: ["operation", "outcome"],
      registers: [this.registry],
    });
    this.stripeDuration = new Histogram({
      name: `${METRIC_PREFIX}stripe_call_duration_seconds`,
      help: "Stripe API call duration in seconds, by operation",
      labelNames: ["operation"],
      buckets: LATENCY_BUCKETS,
      registers: [this.registry],
    });
    this.supplierDuration = new Histogram({
      name: `${METRIC_PREFIX}supplier_request_duration_seconds`,
      help: "Supplier request duration in seconds (placeholder until M4 instruments providers)",
      labelNames: ["supplier"],
      buckets: LATENCY_BUCKETS,
      registers: [this.registry],
    });
  }

  observeHttpRequest({ method, route, status, seconds }: HttpObservation): void {
    const labels = { method, route, status: String(status) };
    this.httpDuration.observe(labels, seconds);
    this.httpRequests.inc(labels);
  }

  recordUnhandledError(code: string, status: number): void {
    this.unhandledErrors.inc({ code, status: String(status) });
  }

  recordStripeCall(operation: string, outcome: string, seconds: number): void {
    this.stripeCalls.inc({ operation, outcome });
    this.stripeDuration.observe({ operation }, seconds);
  }

  /** Placeholder for M4: no supplier is instrumented yet, so nothing calls this in production. */
  recordSupplierRequest(supplier: string, seconds: number): void {
    this.supplierDuration.observe({ supplier }, seconds);
  }

  /**
   * Reads queue and outbox depth from the queue implementation. Called on scrape by a process that
   * runs the worker, so the scrape pays for the query only where the data exists.
   */
  async refreshQueueMetrics(queue: JobQueue): Promise<void> {
    const metrics: JobQueueMetrics = await queue.metrics();

    for (const item of metrics.queues) {
      this.queueJobs.set({ queue: item.name, state: "queued" }, item.queued);
      this.queueJobs.set({ queue: item.name, state: "active" }, item.active);
      this.queueJobs.set({ queue: item.name, state: "failed" }, item.failed);
      this.queueOldestReady.set({ queue: item.name }, item.oldestReadySeconds ?? 0);
    }

    this.outboxEvents.set({ state: "pending" }, metrics.outbox.pending);
    this.outboxEvents.set({ state: "dispatching" }, metrics.outbox.dispatching);
    this.outboxEvents.set({ state: "failed" }, metrics.outbox.failed);
    this.outboxOldestPending.set(metrics.outbox.oldestPendingSeconds ?? 0);
  }

  async render(): Promise<{ body: string; contentType: string }> {
    return { body: await this.registry.metrics(), contentType: this.registry.contentType };
  }
}
