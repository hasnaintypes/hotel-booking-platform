import { createZodDto } from "nestjs-zod";
import {
  forecastReportSchema,
  reportsOverviewSchema,
  systemStatsSchema,
} from "@hotel-booking/contracts";

/** `GET /api/v1/admin/reports/overview`. */
export class ReportsOverviewDto extends createZodDto(reportsOverviewSchema) {}

/** `GET /api/v1/admin/reports/forecast`. */
export class ForecastReportDto extends createZodDto(forecastReportSchema) {}

/** `GET /api/v1/admin/reports/system-stats`. */
export class SystemStatsDto extends createZodDto(systemStatsSchema) {}
