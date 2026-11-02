import {
  BadRequestException,
  ConflictException,
  HttpException,
  UnprocessableEntityException,
} from "@nestjs/common";
import { findPostgresError, POSTGRES_ERROR_CODES } from "@hotel-booking/db";

export class UniqueViolationError extends ConflictException {
  readonly postgresCode = POSTGRES_ERROR_CODES.uniqueViolation;

  constructor(readonly constraint?: string) {
    super("A resource with the same unique value already exists.");
    this.name = "UniqueViolationError";
  }
}

export class ForeignKeyViolationError extends UnprocessableEntityException {
  readonly postgresCode = POSTGRES_ERROR_CODES.foreignKeyViolation;

  constructor(readonly constraint?: string) {
    super("A referenced resource does not exist.");
    this.name = "ForeignKeyViolationError";
  }
}

export class NotNullViolationError extends UnprocessableEntityException {
  readonly postgresCode = POSTGRES_ERROR_CODES.notNullViolation;

  constructor(readonly column?: string) {
    super("A required value is missing.");
    this.name = "NotNullViolationError";
  }
}

export class CheckViolationError extends UnprocessableEntityException {
  readonly postgresCode = POSTGRES_ERROR_CODES.checkViolation;

  constructor(readonly constraint?: string) {
    super("The data violates a business rule.");
    this.name = "CheckViolationError";
  }
}

export class InvalidDatabaseValueError extends BadRequestException {
  readonly postgresCode: string;

  constructor(postgresCode: string) {
    super("A supplied value has an invalid format.");
    this.name = "InvalidDatabaseValueError";
    this.postgresCode = postgresCode;
  }
}

export class TransactionConflictError extends ConflictException {
  readonly postgresCode: string;

  constructor(postgresCode: string) {
    super("The request conflicted with another change. Please try again.");
    this.name = "TransactionConflictError";
    this.postgresCode = postgresCode;
  }
}

export function mapPostgresError(error: unknown): HttpException | undefined {
  const postgresError = findPostgresError(error);
  if (!postgresError) return undefined;

  switch (postgresError.code) {
    case POSTGRES_ERROR_CODES.uniqueViolation:
      return new UniqueViolationError(postgresError.constraint);
    case POSTGRES_ERROR_CODES.foreignKeyViolation:
      return new ForeignKeyViolationError(postgresError.constraint);
    case POSTGRES_ERROR_CODES.notNullViolation:
      return new NotNullViolationError(postgresError.column);
    case POSTGRES_ERROR_CODES.checkViolation:
      return new CheckViolationError(postgresError.constraint);
    case POSTGRES_ERROR_CODES.invalidTextRepresentation:
    case POSTGRES_ERROR_CODES.invalidDatetimeFormat:
    case POSTGRES_ERROR_CODES.numericValueOutOfRange:
      return new InvalidDatabaseValueError(postgresError.code);
    case POSTGRES_ERROR_CODES.serializationFailure:
    case POSTGRES_ERROR_CODES.deadlockDetected:
      return new TransactionConflictError(postgresError.code);
    default:
      return undefined;
  }
}

export function throwPostgresError(error: unknown): never {
  throw mapPostgresError(error) ?? error;
}
