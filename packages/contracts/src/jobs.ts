import { z } from "zod";

/**
 * The durable job vocabulary. The outbox stores these strings in `outbox_events.topic` and the
 * relay forwards them to pg-boss; the API derives its `JOB_NAMES` map from this list so the two
 * cannot drift.
 */
export const JOB_TOPIC_VALUES = [
  "bookings.expire-pending",
  "bookings.sweep-stuck",
  "payments.reconcile",
  "ledger.check",
  "platform.cleanup",
] as const;

export const jobTopicSchema = z.enum(JOB_TOPIC_VALUES);

/**
 * Every scheduled job currently runs with an empty payload. Strict, because a payload should be
 * exactly what the schema says; a producer adding a field has to declare it here first.
 */
export const emptyJobPayloadSchema = z.strictObject({});

export const jobPayloadSchemas = {
  "bookings.expire-pending": emptyJobPayloadSchema,
  "bookings.sweep-stuck": emptyJobPayloadSchema,
  "payments.reconcile": emptyJobPayloadSchema,
  "ledger.check": emptyJobPayloadSchema,
  "platform.cleanup": emptyJobPayloadSchema,
} as const satisfies Record<JobTopic, z.ZodType>;

export type JobTopic = z.infer<typeof jobTopicSchema>;

/** The payload type each topic accepts; all of them are `{}` today. */
export type JobPayloads = {
  [Topic in JobTopic]: z.infer<(typeof jobPayloadSchemas)[Topic]>;
};

/** Narrows an arbitrary queue name to the contract vocabulary. */
export function isJobTopic(topic: string): topic is JobTopic {
  return jobTopicSchema.safeParse(topic).success;
}

/**
 * Validates a payload for a contract topic and returns the parsed object. Queue names outside
 * `JOB_TOPIC_VALUES` are deliberately left alone: the queue abstraction is also used for ad-hoc
 * test queues, and only the durable job vocabulary is contracted.
 */
export function parseJobPayload(topic: string, payload: unknown): Record<string, unknown> {
  if (!isJobTopic(topic)) return payload as Record<string, unknown>;

  const result = jobPayloadSchemas[topic].safeParse(payload);
  if (!result.success) {
    throw new Error(`Invalid payload for job topic "${topic}": ${z.prettifyError(result.error)}`);
  }

  return result.data as Record<string, unknown>;
}
