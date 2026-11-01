import { AxiosError } from "axios";
import { describe, expect, it } from "vitest";
import { apiErrorMessage } from "./api-error";

const failure = (status: number, data: unknown) =>
  new AxiosError("Request failed with status code " + status, "ERR_BAD_REQUEST", undefined, null, {
    status,
    statusText: "",
    headers: {},
    config: {} as never,
    data,
  });

describe("apiErrorMessage", () => {
  it("shows the server's field messages, joined", () => {
    const error = failure(400, {
      detail: "Request validation failed",
      errors: [
        { field: "password", message: "Password must be at least 10 characters" },
        { field: "email", message: "Email is required" },
      ],
    });
    expect(apiErrorMessage(error)).toBe(
      "Password must be at least 10 characters Email is required",
    );
  });

  it("falls back to the problem detail, then the message", () => {
    expect(apiErrorMessage(failure(429, { detail: "Too many failed sign-in attempts." }))).toBe(
      "Too many failed sign-in attempts.",
    );
    expect(apiErrorMessage(failure(400, { message: "Invalid Credentials" }))).toBe(
      "Invalid Credentials",
    );
  });

  it("never shows axios' own message", () => {
    expect(apiErrorMessage(failure(500, undefined))).toBe(
      "Something went wrong. Please try again.",
    );
    expect(apiErrorMessage(failure(500, {}))).not.toMatch(/status code/);
  });

  it("ignores empty or non-text values", () => {
    const error = failure(400, { errors: [{ message: "" }, { message: 5 }, {}], detail: "  " });
    expect(apiErrorMessage(error)).toBe("Something went wrong. Please try again.");
  });

  it("says so when the server could not be reached", () => {
    const offline = new AxiosError("Network Error", "ERR_NETWORK");
    expect(apiErrorMessage(offline)).toMatch(/couldn't reach the server/);
  });

  it("uses the given fallback for anything that is not an API error", () => {
    expect(apiErrorMessage(new Error("boom"), "Custom")).toBe("Custom");
    expect(apiErrorMessage("text")).toBe("Something went wrong. Please try again.");
    expect(apiErrorMessage(undefined)).toBe("Something went wrong. Please try again.");
  });
});
