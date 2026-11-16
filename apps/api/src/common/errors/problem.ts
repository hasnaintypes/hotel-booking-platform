/**
 * The API's error vocabulary is part of the public contract, so it lives in
 * `@hotel-booking/contracts` and is re-exported here for the code that raises and maps errors.
 */
export {
  ERROR_CODES,
  PROBLEM_CONTENT_TYPE,
  errorCodeSchema,
  fieldErrorSchema,
  problemDetailsSchema,
  problemType,
  type ErrorCode,
  type FieldError,
  type ProblemDetails,
} from "@hotel-booking/contracts";
