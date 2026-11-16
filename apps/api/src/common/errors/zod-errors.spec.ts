import { describe, expect, it } from "vitest";
import { fieldErrorsFromZod } from "./zod-errors";

describe("fieldErrorsFromZod", () => {
  it("maps a field issue", () => {
    expect(fieldErrorsFromZod({ issues: [{ path: ["page"], message: "Too small" }] })).toEqual([
      { field: "page", message: "Too small" },
    ]);
  });

  it("keeps nested object paths", () => {
    expect(
      fieldErrorsFromZod({ issues: [{ path: ["contact", "email"], message: "Invalid" }] }),
    ).toEqual([{ field: "contact.email", message: "Invalid" }]);
  });

  it("drops array indices so the field matches the class-validator shape", () => {
    expect(fieldErrorsFromZod({ issues: [{ path: ["stars", 0], message: "Too big" }] })).toEqual([
      { field: "stars", message: "Too big" },
    ]);
  });

  it("falls back to a request-level field for a root issue", () => {
    expect(fieldErrorsFromZod({ issues: [{ path: [], message: "Expected object" }] })).toEqual([
      { field: "request", message: "Expected object" },
    ]);
  });

  it("returns nothing for a value that is not a Zod error", () => {
    expect(fieldErrorsFromZod(new Error("nope"))).toEqual([]);
    expect(fieldErrorsFromZod(undefined)).toEqual([]);
  });
});
