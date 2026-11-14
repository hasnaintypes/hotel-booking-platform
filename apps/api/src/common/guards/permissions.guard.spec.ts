import { ForbiddenException, type ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { describe, expect, it } from "vitest";
import { PermissionsGuard } from "./permissions.guard";

const contextFor = (userId?: string): ExecutionContext =>
  ({
    getHandler: () => () => undefined,
    getClass: () => class {},
    switchToHttp: () => ({
      getRequest: () => ({ user: userId ? { userId } : undefined }),
    }),
  }) as unknown as ExecutionContext;

const guardFor = (required: readonly string[] | undefined, role: string | undefined) => {
  const reflector = {
    getAllAndOverride: () => required,
  } as unknown as Reflector;
  const users = {
    findById: async () => (role === undefined ? undefined : { id: "u1", role }),
  };
  return new PermissionsGuard(reflector, users as never);
};

const BOOKING_RETRY = ["booking.retry"];

describe("PermissionsGuard", () => {
  it("allows a handler that declares no permissions", async () => {
    await expect(guardFor(undefined, "user").canActivate(contextFor("u1"))).resolves.toBe(true);
    await expect(guardFor([], "user").canActivate(contextFor("u1"))).resolves.toBe(true);
  });

  it("allows an admin to perform a declared manual action", async () => {
    await expect(guardFor(BOOKING_RETRY, "admin").canActivate(contextFor("u1"))).resolves.toBe(
      true,
    );
  });

  it("rejects a guest who holds no permissions", async () => {
    await expect(guardFor(BOOKING_RETRY, "user").canActivate(contextFor("u1"))).rejects.toThrow(
      ForbiddenException,
    );
  });

  it("rejects an anonymous request", async () => {
    await expect(guardFor(BOOKING_RETRY, "admin").canActivate(contextFor())).rejects.toThrow(
      ForbiddenException,
    );
  });

  it("rejects a token whose user no longer exists", async () => {
    await expect(guardFor(BOOKING_RETRY, undefined).canActivate(contextFor("u1"))).rejects.toThrow(
      ForbiddenException,
    );
  });

  it("requires every declared permission, not just one", async () => {
    const guard = guardFor(["booking.read", "reconciliation.manage"], "user");
    await expect(guard.canActivate(contextFor("u1"))).rejects.toThrow(ForbiddenException);
  });
});
