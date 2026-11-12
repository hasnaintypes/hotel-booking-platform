export const JOB_NAMES = {
  expirePendingBookings: "bookings.expire-pending",
  sweepStuckBookings: "bookings.sweep-stuck",
  reconcilePayments: "payments.reconcile",
  checkLedger: "ledger.check",
  cleanupPlatformTables: "platform.cleanup",
} as const;

export type JobName = (typeof JOB_NAMES)[keyof typeof JOB_NAMES];
