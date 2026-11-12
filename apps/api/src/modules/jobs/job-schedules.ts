import type { JobQueue } from "../../domain/jobs/job-queue";
import { JOB_NAMES } from "./job-names";

export type JobScheduleSettings = {
  expiryCron: string;
  sweepCron: string;
  reconcileCron: string;
  ledgerCron: string;
  cleanupCron: string;
};

export async function registerSchedules(
  queue: JobQueue,
  settings: JobScheduleSettings,
): Promise<void> {
  await queue.schedule(
    JOB_NAMES.expirePendingBookings,
    settings.expiryCron,
    {},
    { key: "default" },
  );
  await queue.schedule(JOB_NAMES.sweepStuckBookings, settings.sweepCron, {}, { key: "default" });
  await queue.schedule(JOB_NAMES.reconcilePayments, settings.reconcileCron, {}, { key: "default" });
  await queue.schedule(JOB_NAMES.checkLedger, settings.ledgerCron, {}, { key: "default" });
  await queue.schedule(
    JOB_NAMES.cleanupPlatformTables,
    settings.cleanupCron,
    {},
    { key: "default" },
  );
}
