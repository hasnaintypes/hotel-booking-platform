import type { Discrepancy } from "@hotel-booking/contracts";
import type { DiscrepancyRecord } from "../../database/repositories/reconciliation.repository";

const detailsOf = (value: unknown): Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

/** Maps the stored finding to the wire shape: dates become ISO strings, nullable columns stay null. */
export function toDiscrepancyResponse(row: DiscrepancyRecord): Discrepancy {
  return {
    id: row.id,
    dedupeKey: row.dedupeKey,
    kind: row.kind as Discrepancy["kind"],
    status: row.status as Discrepancy["status"],
    provider: row.provider,
    bookingId: row.bookingId,
    paymentId: row.paymentId,
    providerReference: row.providerReference,
    details: detailsOf(row.details),
    detectedAt: row.detectedAt.toISOString(),
    resolvedAt: row.resolvedAt ? row.resolvedAt.toISOString() : null,
    resolution: row.resolution,
    assignedToUserId: row.assignedToUserId,
    assignedAt: row.assignedAt ? row.assignedAt.toISOString() : null,
    assignedByUserId: row.assignedByUserId,
    resolvedByUserId: row.resolvedByUserId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
