import { describe, expect, it } from "vitest";
import { ifMatchSatisfied, ifNoneMatchSatisfied, representationEtag } from "./etag";

describe("representationEtag", () => {
  it("is stable for an identical body and changes with any field", () => {
    const first = representationEtag({ id: "a", isActive: true });

    expect(representationEtag({ id: "a", isActive: true })).toBe(first);
    expect(representationEtag({ id: "a", isActive: false })).not.toBe(first);
  });

  it("quotes the value so it is a valid entity tag", () => {
    expect(representationEtag({})).toMatch(/^"[A-Za-z0-9_-]{27}"$/);
  });
});

describe("ifMatchSatisfied", () => {
  const etag = representationEtag({ id: "a" });

  it("passes when the header is absent, because the precondition is optional", () => {
    expect(ifMatchSatisfied(undefined, etag)).toBe(true);
  });

  it("accepts the exact tag, a weak form of it, a list, and *", () => {
    expect(ifMatchSatisfied(etag, etag)).toBe(true);
    expect(ifMatchSatisfied(`W/${etag}`, etag)).toBe(true);
    expect(ifMatchSatisfied(`"other", ${etag}`, etag)).toBe(true);
    expect(ifMatchSatisfied("*", etag)).toBe(true);
  });

  it("rejects a stale or malformed tag", () => {
    expect(ifMatchSatisfied('"stale"', etag)).toBe(false);
    expect(ifMatchSatisfied("", etag)).toBe(false);
  });
});

describe("ifNoneMatchSatisfied", () => {
  const etag = representationEtag({ id: "a" });

  it("is false without a header", () => {
    expect(ifNoneMatchSatisfied(undefined, etag)).toBe(false);
  });

  it("matches the current tag in any accepted form", () => {
    expect(ifNoneMatchSatisfied(etag, etag)).toBe(true);
    expect(ifNoneMatchSatisfied(`W/${etag}`, etag)).toBe(true);
    expect(ifNoneMatchSatisfied("*", etag)).toBe(true);
  });

  it("does not match a different tag", () => {
    expect(ifNoneMatchSatisfied('"stale"', etag)).toBe(false);
  });
});
