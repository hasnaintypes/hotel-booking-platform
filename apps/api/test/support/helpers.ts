import request from "supertest";
import type { TestApp } from "./create-app";
import { routes } from "./routes";

let counter = 0;

export type Credentials = { email: string; password: string; firstName: string; lastName: string };

export function newCredentials(overrides: Partial<Credentials> = {}): Credentials {
  counter += 1;
  return {
    email: `user${counter}-${Date.now()}@example.test`,
    password: "correct-horse-battery-staple",
    firstName: "Test",
    lastName: `User${counter}`,
    ...overrides,
  };
}

/** Registers a user and returns a cookie-keeping agent signed in as that user. */
export async function registerUser(t: TestApp, overrides: Partial<Credentials> = {}) {
  const credentials = newCredentials(overrides);
  const agent = request.agent(t.app.getHttpServer());
  const response = await agent.post(routes.auth.register).send(credentials);
  if (response.status !== 201) {
    throw new Error(`register failed: ${response.status} ${JSON.stringify(response.body)}`);
  }
  const me = await agent.get(routes.users.me);
  return { agent, credentials, user: me.body as { _id: string; email: string; role: string } };
}

/** Promotes a user to admin directly in the database (no API exists for the first admin). */
export async function promoteToAdmin(t: TestApp, userId: string) {
  await t.connection
    .collection("users")
    .updateOne(
      { _id: new (await import("mongoose")).Types.ObjectId(userId) },
      { $set: { role: "admin" } },
    );
}

export function anonymous(t: TestApp) {
  return request(t.app.getHttpServer());
}
