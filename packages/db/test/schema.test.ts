import { describe, expect, expectTypeOf, it } from "vitest";
import { users, type NewUser, type User } from "../src/index";

describe("schema types", () => {
  it("infers the users row and insert types", () => {
    expect(users).toBeDefined();
    expectTypeOf<User>().toMatchTypeOf<{
      id: string;
      email: string;
      createdAt: Date;
      updatedAt: Date;
    }>();
    expectTypeOf<NewUser>().toMatchTypeOf<{ email: string }>();
    expectTypeOf<NewUser["id"]>().toEqualTypeOf<string | undefined>();
  });
});
