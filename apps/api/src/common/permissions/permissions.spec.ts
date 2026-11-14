import { describe, expect, it } from "vitest";
import { hasPermission, isPermission, PERMISSIONS, permissionsForRole } from "./permissions";

describe("permissions", () => {
  it("gives an admin every manual action and gives a guest none", () => {
    expect(permissionsForRole("admin")).toEqual(PERMISSIONS);
    expect(permissionsForRole("user")).toEqual([]);
  });

  it("denies unknown or missing roles instead of defaulting open", () => {
    expect(permissionsForRole(undefined)).toEqual([]);
    expect(permissionsForRole("superuser")).toEqual([]);
    expect(hasPermission("superuser", "booking.cancel")).toBe(false);
  });

  it("checks one permission at a time", () => {
    expect(hasPermission("admin", "booking.retry")).toBe(true);
    expect(hasPermission("user", "booking.retry")).toBe(false);
  });

  it("recognises only declared permission names", () => {
    expect(isPermission("booking.mark_reviewed")).toBe(true);
    expect(isPermission("booking.delete")).toBe(false);
    expect(isPermission(undefined)).toBe(false);
  });
});
