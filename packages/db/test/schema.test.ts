import { describe, expect, expectTypeOf, it } from "vitest";
import {
  bookings,
  credentials,
  currencies,
  exchangeRates,
  facilities,
  fxRateSnapshots,
  hotelFacilities,
  hotelHotelTypes,
  hotelImages,
  hotels,
  hotelTypes,
  memberships,
  oauthAccounts,
  organisationRoles,
  organisations,
  reviews,
  rolePermissions,
  users,
  type NewUser,
  type User,
} from "../src/index";

describe("schema types", () => {
  it("infers the users row and insert types", () => {
    expect(users).toBeDefined();
    expectTypeOf<User>().toMatchTypeOf<{
      id: string;
      email: string;
      role: "user" | "admin";
      status: "active" | "suspended";
      createdAt: Date;
      updatedAt: Date;
    }>();
    expectTypeOf<NewUser>().toMatchTypeOf<{ email: string }>();
    expectTypeOf<NewUser["id"]>().toEqualTypeOf<string | undefined>();
  });

  it("exposes every schema-v1 table", () => {
    expect([
      users,
      credentials,
      oauthAccounts,
      hotels,
      hotelImages,
      facilities,
      hotelFacilities,
      hotelHotelTypes,
      hotelTypes,
      organisations,
      organisationRoles,
      rolePermissions,
      memberships,
      currencies,
      exchangeRates,
      fxRateSnapshots,
      bookings,
      reviews,
    ]).toHaveLength(18);
  });
});
