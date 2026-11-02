export const POSTGRES_ERROR_CODES = {
  uniqueViolation: "23505",
  foreignKeyViolation: "23503",
  notNullViolation: "23502",
  checkViolation: "23514",
  invalidTextRepresentation: "22P02",
  invalidDatetimeFormat: "22007",
  numericValueOutOfRange: "22003",
  serializationFailure: "40001",
  deadlockDetected: "40P01",
} as const;

export type PostgresErrorCode = (typeof POSTGRES_ERROR_CODES)[keyof typeof POSTGRES_ERROR_CODES];

export type PostgresError = {
  name: string;
  message: string;
  code: PostgresErrorCode;
  detail?: string;
  hint?: string;
  schema?: string;
  table?: string;
  column?: string;
  constraint?: string;
  cause?: unknown;
};

const KNOWN_CODES = new Set<string>(Object.values(POSTGRES_ERROR_CODES));
const MAX_CAUSE_DEPTH = 5;

export function findPostgresError(error: unknown): PostgresError | undefined {
  let current: unknown = error;

  for (let depth = 0; depth < MAX_CAUSE_DEPTH; depth += 1) {
    if (typeof current !== "object" || current === null) return undefined;
    const candidate = current as Record<string, unknown>;

    if (
      typeof candidate.code === "string" &&
      KNOWN_CODES.has(candidate.code) &&
      typeof candidate.message === "string"
    ) {
      return candidate as PostgresError;
    }

    current = candidate.cause;
  }

  return undefined;
}

export function isRetryableTransactionError(error: unknown): boolean {
  const code = findPostgresError(error)?.code;
  return (
    code === POSTGRES_ERROR_CODES.serializationFailure ||
    code === POSTGRES_ERROR_CODES.deadlockDetected
  );
}
