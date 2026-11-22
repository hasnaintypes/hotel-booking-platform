import { z } from "zod";
import { isoDateTimeSchema } from "./primitives";

/** `GET /health/live`; liveness never touches the database. */
export const healthStatusSchema = z.object({
  status: z.literal("ok"),
  timestamp: isoDateTimeSchema,
});

/** `GET /health/ready`; the component checks are spread flat into the body. */
export const readinessSchema = z.object({
  status: z.enum(["ready", "not_ready"]),
  timestamp: isoDateTimeSchema,
  postgres: z.enum(["connected", "disconnected"]),
  migrations: z.enum(["ready", "pending", "unknown"]),
});

/** `GET /api/v1/admin/system/health`; the same body is returned with 503 when unhealthy. */
export const systemHealthSchema = z.object({
  status: z.enum(["healthy", "unhealthy"]),
  timestamp: isoDateTimeSchema,
  performance: z.object({
    memory: z.object({
      usedMb: z.number().int(),
      totalMb: z.number().int(),
      percentage: z.number().int(),
    }),
    uptime: z.number().int(),
  }),
  checks: z.object({
    postgres: z.enum(["connected", "disconnected"]),
    migrations: z.enum(["ready", "pending", "unknown"]),
  }),
});

/** `GET /api/v1/admin/system/jobs`. */
export const jobQueueMetricsSchema = z.object({
  enabled: z.boolean(),
  queues: z.array(
    z.object({
      name: z.string(),
      queued: z.number().int(),
      active: z.number().int(),
      failed: z.number().int(),
      oldestReadySeconds: z.number().nullable(),
    }),
  ),
  totals: z.object({
    queued: z.number().int(),
    active: z.number().int(),
    failed: z.number().int(),
    oldestReadySeconds: z.number().nullable(),
  }),
  outbox: z.object({
    pending: z.number().int(),
    dispatching: z.number().int(),
    failed: z.number().int(),
    oldestPendingSeconds: z.number().nullable(),
  }),
});

export type HealthStatus = z.infer<typeof healthStatusSchema>;
export type Readiness = z.infer<typeof readinessSchema>;
export type SystemHealth = z.infer<typeof systemHealthSchema>;
export type JobQueueMetrics = z.infer<typeof jobQueueMetricsSchema>;
