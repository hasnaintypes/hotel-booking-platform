import { describe, expect, it, vi } from "vitest";
import type { JobQueue } from "../../domain/jobs/job-queue";
import { MetricsService } from "./metrics.service";

const queueMetrics = {
  enabled: true,
  queues: [
    { name: "bookings.expire-pending", queued: 2, active: 1, failed: 3, oldestReadySeconds: 12 },
  ],
  totals: { queued: 2, active: 1, failed: 3, oldestReadySeconds: 12 },
  outbox: { pending: 4, dispatching: 1, failed: 2, oldestPendingSeconds: 30 },
};

const fakeQueue = () => ({ metrics: vi.fn(async () => queueMetrics) }) as unknown as JobQueue;

describe("MetricsService", () => {
  it("renders HTTP observations with route templates and status labels", async () => {
    const metrics = new MetricsService();
    metrics.observeHttpRequest({
      method: "GET",
      route: "/api/v1/hotels/:id",
      status: 200,
      seconds: 0.02,
    });

    const { body, contentType } = await metrics.render();

    expect(contentType).toContain("text/plain");
    expect(body).toContain("hotel_booking_http_requests_total");
    expect(body).toContain('method="GET"');
    expect(body).toContain('route="/api/v1/hotels/:id"');
    expect(body).toContain('status="200"');
    expect(body).toContain("hotel_booking_http_request_duration_seconds_bucket");
  });

  it("counts unhandled errors by code and status", async () => {
    const metrics = new MetricsService();
    metrics.recordUnhandledError("INTERNAL_ERROR", 500);

    const { body } = await metrics.render();

    expect(body).toContain("hotel_booking_unhandled_errors_total");
    expect(body).toContain('code="INTERNAL_ERROR"');
    expect(body).toContain('status="500"');
  });

  it("records Stripe call outcomes and durations", async () => {
    const metrics = new MetricsService();
    metrics.recordStripeCall("paymentIntents.capture", "success", 0.15);
    metrics.recordStripeCall("paymentIntents.capture", "card_error", 0.2);

    const { body } = await metrics.render();

    expect(body).toContain('operation="paymentIntents.capture",outcome="success"');
    expect(body).toContain('operation="paymentIntents.capture",outcome="card_error"');
    expect(body).toContain("hotel_booking_stripe_call_duration_seconds_count");
  });

  it("refreshes queue and outbox gauges from the queue implementation", async () => {
    const metrics = new MetricsService();
    const queue = fakeQueue();

    await metrics.refreshQueueMetrics(queue);

    const { body } = await metrics.render();
    expect(queue.metrics).toHaveBeenCalledOnce();
    expect(body).toContain(
      'hotel_booking_job_queue_jobs{queue="bookings.expire-pending",state="queued",service="hotel-booking-api"} 2',
    );
    expect(body).toContain(
      'hotel_booking_job_queue_jobs{queue="bookings.expire-pending",state="failed",service="hotel-booking-api"} 3',
    );
    expect(body).toContain(
      'hotel_booking_job_queue_oldest_ready_seconds{queue="bookings.expire-pending",service="hotel-booking-api"} 12',
    );
    expect(body).toContain(
      'hotel_booking_outbox_events{state="pending",service="hotel-booking-api"} 4',
    );
    expect(body).toContain(
      'hotel_booking_outbox_oldest_pending_seconds{service="hotel-booking-api"} 30',
    );
  });

  it("labels every metric with the service name", async () => {
    const metrics = new MetricsService();
    metrics.observeHttpRequest({
      method: "GET",
      route: "/health/live",
      status: 200,
      seconds: 0.001,
    });

    const { body } = await metrics.render();

    expect(body).toContain('service="hotel-booking-api"');
  });
});
