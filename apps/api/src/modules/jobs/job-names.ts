export const JOB_NAMES = {
  expirePendingBookings: "bookings.expire-pending",
  reconcilePayments: "payments.reconcile",
  cleanupPlatformTables: "platform.cleanup",
} as const;

export type JobName = (typeof JOB_NAMES)[keyof typeof JOB_NAMES];
