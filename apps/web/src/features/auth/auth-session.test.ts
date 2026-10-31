import { authSession } from "@hotel-booking/api-client";
import { beforeEach, describe, expect, it, vi } from "vitest";

describe("auth session hint", () => {
  beforeEach(() => {
    localStorage.clear();
    authSession.clear();
  });

  it("stores and reads a non-sensitive session hint", () => {
    authSession.set();

    expect(authSession.get()).toBe(true);
    expect(localStorage.getItem("auth_session")).toBe("1");
    expect(localStorage.getItem("session_id")).toBeNull();
  });

  it("notifies subscribers when the session changes", () => {
    const listener = vi.fn();
    const unsubscribe = authSession.subscribe(listener);

    authSession.set();
    authSession.clear();

    expect(listener).toHaveBeenCalled();
    expect(authSession.get()).toBe(false);
    unsubscribe();
  });

  it("stops notifying after unsubscribe", () => {
    const listener = vi.fn();
    const unsubscribe = authSession.subscribe(listener);
    unsubscribe();
    listener.mockClear();

    authSession.set();

    expect(listener).not.toHaveBeenCalled();
  });
});
