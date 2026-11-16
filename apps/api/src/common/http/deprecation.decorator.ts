import { SetMetadata } from "@nestjs/common";

export const DEPRECATION = "api:deprecation";

export type DeprecationInfo = {
  /** When the route became deprecated; sent as a Structured Field date (`@<epoch>`). */
  since: Date;
  /** When the route stops working, if that is already decided. */
  sunset?: Date;
  /** Absolute or root-relative URL of the route that replaces it. */
  replacement?: string;
};

/**
 * Announces a route retirement on the response itself (RFC 9745 `Deprecation`, RFC 8594 `Sunset`)
 * and points at the successor with a `successor-version` link.
 *
 * Response headers travel with the 2xx and the error responses alike, so a client that only ever
 * sees failures still learns the route is going away.
 */
export const Deprecated = (info: DeprecationInfo) => SetMetadata(DEPRECATION, info);
