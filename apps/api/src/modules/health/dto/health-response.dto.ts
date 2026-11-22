import { createZodDto } from "nestjs-zod";
import {
  healthStatusSchema,
  jobQueueMetricsSchema,
  readinessSchema,
  systemHealthSchema,
} from "@hotel-booking/contracts";

/** `GET /health/live`. */
export class HealthStatusDto extends createZodDto(healthStatusSchema) {}

/** `GET /health/ready`; the same body is returned with 503 when not ready. */
export class ReadinessDto extends createZodDto(readinessSchema) {}

/** `GET /api/v1/admin/system/health`; the same body is returned with 503 when unhealthy. */
export class SystemHealthDto extends createZodDto(systemHealthSchema) {}

/** `GET /api/v1/admin/system/jobs`. */
export class JobQueueMetricsDto extends createZodDto(jobQueueMetricsSchema) {}
