import { JOB_TOPIC_VALUES } from "@hotel-booking/contracts";

/**
 * Semantic names for the contract-owned topic vocabulary. The order mirrors `JOB_TOPIC_VALUES`, so
 * the API and `packages/contracts` cannot drift; a test asserts the two lists stay identical.
 */
export const JOB_NAMES = {
  expirePendingBookings: JOB_TOPIC_VALUES[0],
  sweepStuckBookings: JOB_TOPIC_VALUES[1],
  reconcilePayments: JOB_TOPIC_VALUES[2],
  checkLedger: JOB_TOPIC_VALUES[3],
  cleanupPlatformTables: JOB_TOPIC_VALUES[4],
} as const;

export type JobName = (typeof JOB_NAMES)[keyof typeof JOB_NAMES];
