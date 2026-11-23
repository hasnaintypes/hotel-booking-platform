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
 * The correlation id an HTTP request receives in `X-Request-Id`. It is bounded and restricted to
 * characters that are safe in a log line and a header, so a value from a gateway or client can be
 * reused without allowing log injection. The API accepts exactly this shape.
 */
export const requestIdSchema = z
  .string()
  .regex(/^[A-Za-z0-9._:-]{8,128}$/, "must be 8-128 characters of letters, digits, . _ : -");

/**
 * Every job payload carries the id of the request that caused it, when there was one. Scheduled
 * runs have no originating request and send `{}`. Strict, because a payload should be exactly what
 * the schema says; a producer adding a field has to declare it here first.
 */
export const jobPayloadSchema = z.strictObject({ requestId: requestIdSchema.optional() });

export const jobPayloadSchemas = {
  "bookings.expire-pending": jobPayloadSchema,
  "bookings.sweep-stuck": jobPayloadSchema,
  "payments.reconcile": jobPayloadSchema,
  "ledger.check": jobPayloadSchema,
  "platform.cleanup": jobPayloadSchema,
} as const satisfies Record<JobTopic, z.ZodType>;

export type JobTopic = z.infer<typeof jobTopicSchema>;

/** The payload type each topic accepts: an optional request id, nothing else. */
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
