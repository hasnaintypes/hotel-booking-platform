import { createZodDto } from "nestjs-zod";
import { discrepancyListQuerySchema } from "@hotel-booking/contracts";

/**
 * Filters for the discrepancy queue, validated by the shared contract.
 *
 * The queue is cursor-paginated and its ordering depends on the filter: open findings oldest
 * first, closed history newest first. A cursor therefore carries the ordering it was minted for.
 */
export class ListDiscrepanciesQueryDto extends createZodDto(discrepancyListQuerySchema) {}
