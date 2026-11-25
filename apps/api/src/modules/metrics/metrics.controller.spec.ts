import { NotFoundException, UnauthorizedException } from "@nestjs/common";
import type { ConfigService } from "@nestjs/config";
import type { Response } from "express";
import { describe, expect, it, vi } from "vitest";
import type { JobQueue } from "../../domain/jobs/job-queue";
import { MetricsService } from "../../common/metrics/metrics.service";
import { MetricsController } from "./metrics.controller";

const config = (values: Record<string, unknown>): ConfigService =>
  ({ get: (key: string) => values[key] }) as unknown as ConfigService;

const response = () => {
  const res = { type: vi.fn(), send: vi.fn() };
  res.type.mockReturnValue(res);
  return res as unknown as Response & {
    type: ReturnType<typeof vi.fn>;
    send: ReturnType<typeof vi.fn>;
  };
};

const metrics = () =>
  ({
    refreshQueueMetrics: vi.fn(async () => undefined),
    render: vi.fn(async () => ({
      body: "hotel_booking_http_requests_total 1",
      contentType: "text/plain",
    })),
  }) as unknown as MetricsService & {
    refreshQueueMetrics: ReturnType<typeof vi.fn>;
    render: ReturnType<typeof vi.fn>;
  };

const queue = () => ({ metrics: vi.fn() }) as unknown as JobQueue;

describe("MetricsController", () => {
  it("serves the exposition outside production without a token", async () => {
    const service = metrics();
    const res = response();
    const controller = new MetricsController(service, config({ nodeEnv: "development" }), queue());

    await controller.scrape(undefined, res);

    expect(res.type).toHaveBeenCalledWith("text/plain");
    expect(res.send).toHaveBeenCalledWith("hotel_booking_http_requests_total 1");
  });

  it("is disabled in production when no token is configured", async () => {
    const service = metrics();
    const controller = new MetricsController(
      service,
      config({ nodeEnv: "production", "jobs.workerEnabled": false }),
      queue(),
    );

    await expect(controller.scrape(undefined, response())).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(service.render).not.toHaveBeenCalled();
  });

  it("requires the configured bearer token", async () => {
    const service = metrics();
    const controller = new MetricsController(
      service,
      config({ nodeEnv: "production", "metrics.token": "secret-token" }),
      queue(),
    );

    await expect(controller.scrape(undefined, response())).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    await expect(controller.scrape("Bearer wrong", response())).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(service.render).not.toHaveBeenCalled();
  });

  it("serves with the correct bearer token", async () => {
    const service = metrics();
    const res = response();
    const controller = new MetricsController(
      service,
      config({ nodeEnv: "production", "metrics.token": "secret-token" }),
      queue(),
    );

    await controller.scrape("Bearer secret-token", res);

    expect(res.send).toHaveBeenCalledWith("hotel_booking_http_requests_total 1");
  });

  it("refreshes queue gauges only in the worker process", async () => {
    const jobs = queue();

    const apiService = metrics();
    await new MetricsController(
      apiService,
      config({ nodeEnv: "development", "jobs.workerEnabled": false }),
      jobs,
    ).scrape(undefined, response());
    expect(apiService.refreshQueueMetrics).not.toHaveBeenCalled();

    const workerService = metrics();
    await new MetricsController(
      workerService,
      config({ nodeEnv: "development", "jobs.workerEnabled": true }),
      jobs,
    ).scrape(undefined, response());
    expect(workerService.refreshQueueMetrics).toHaveBeenCalledWith(jobs);
  });
});
