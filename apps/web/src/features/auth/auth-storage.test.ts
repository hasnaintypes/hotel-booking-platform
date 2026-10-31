import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearSessionToken,
  getSessionToken,
  setSessionToken,
  subscribeToAuth,
} from "./auth-storage";

describe("auth storage", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("stores and reads the session token", () => {
    setSessionToken("token-123");
    expect(getSessionToken()).toBe("token-123");
  });

  it("notifies subscribers when the session changes", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeToAuth(listener);

    setSessionToken("token-123");
    clearSessionToken();

    expect(listener).toHaveBeenCalledTimes(2);
    expect(getSessionToken()).toBeNull();
    unsubscribe();
  });

  it("stops notifying after unsubscribe", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeToAuth(listener);
    unsubscribe();

    setSessionToken("token-123");

    expect(listener).not.toHaveBeenCalled();
  });
});
