import { createZodDto } from "nestjs-zod";
import { rollupPageSchema, rollupSchema } from "@hotel-booking/contracts";

/** `GET /api/v1/admin/reports/rollups` — one page of snapshots, newest first. */
export class RollupPageDto extends createZodDto(rollupPageSchema) {}

/** `POST /api/v1/admin/reports/rollups` — the captured snapshot. */
export class RollupDto extends createZodDto(rollupSchema) {}
