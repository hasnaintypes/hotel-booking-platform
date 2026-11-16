import { SetMetadata } from "@nestjs/common";

export const RESPONSE_ETAG = "api:response-etag";

/**
 * Marks a read route whose response carries a strong `ETag`, and which therefore answers
 * `If-None-Match` with `304 Not Modified`.
 *
 * Use it on a GET that returns the same representation a conditional write route validates via
 * `If-Match`, so a client can round-trip the tag.
 */
export const ResponseEtag = () => SetMetadata(RESPONSE_ETAG, true);
