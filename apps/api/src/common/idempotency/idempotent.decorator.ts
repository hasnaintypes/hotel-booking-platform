import { SetMetadata } from "@nestjs/common";

export const IDEMPOTENT_METADATA_KEY = "__idempotent_scope__";

/**
 * Marks a mutating route as idempotent. A request with an `Idempotency-Key` header is executed at
 * most once per principal; replays return the stored response. Pass a stable operation name when
 * the controller method may be renamed.
 */
export const Idempotent = (operation?: string) =>
  SetMetadata(IDEMPOTENT_METADATA_KEY, operation ?? "");
