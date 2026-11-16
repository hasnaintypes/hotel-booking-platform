import { createZodDto } from "nestjs-zod";
import { rollupListQuerySchema } from "@hotel-booking/contracts";

/** `GET /api/v1/admin/reports/rollups` — daily analytics snapshots, newest first. */
export class RollupListQueryDto extends createZodDto(rollupListQuerySchema) {}
