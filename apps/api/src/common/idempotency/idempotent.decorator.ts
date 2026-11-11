import { SetMetadata } from "@nestjs/common";

export const IDEMPOTENT_METADATA_KEY = "__idempotent_scope__";

export type IdempotentOptions = {
  /**
   * Reject a request that does not carry `Idempotency-Key` with a 400. Use this on creation
   * endpoints where a retry without a key could create a duplicate resource.
   */
  required?: boolean;
};

export type IdempotentMetadata = {
  operation: string;
  required: boolean;
};

/**
 * Marks a mutating route as idempotent. A request with an `Idempotency-Key` header is executed at
 * most once per principal; replays return the stored response. Pass a stable operation name when
 * the controller method may be renamed.
 */
export const Idempotent = (operation?: string, options: IdempotentOptions = {}) =>
  SetMetadata(IDEMPOTENT_METADATA_KEY, {
    operation: operation ?? "",
    required: options.required === true,
  } satisfies IdempotentMetadata);
