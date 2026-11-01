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

/**
 * Sets environment variables for the app a test is about to create (configuration is read when the
 * app boots). Returns a function that puts the previous values back.
 */
export function withEnv(values: Record<string, string>): () => void {
  const previous: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(values)) {
    previous[key] = process.env[key];
    process.env[key] = value;
  }
  return () => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  };
}

/** A signed-in admin. */
export async function registerAdmin(t: TestApp) {
  const admin = await registerUser(t);
  await promoteToAdmin(t, admin.user._id);
  return admin;
}

let hotelCounter = 0;

/** Inserts a hotel straight into the database (through the model, so the schema still applies). */
export async function insertHotel(
  t: TestApp,
  ownerId: string,
  overrides: Record<string, unknown> = {},
) {
  hotelCounter += 1;
  const hotel = (await t.connection.model("Hotel").create({
    userId: ownerId,
    name: `Test Hotel ${hotelCounter}`,
    city: "London",
    country: "United Kingdom",
    description: "A hotel used by the integration tests.",
    type: ["Hotel"],
    adultCount: 2,
    childCount: 1,
    facilities: ["Free WiFi"],
    pricePerNight: 100,
    starRating: 4,
    imageUrls: ["https://res.cloudinary.test/image-0.jpg"],
    lastUpdated: new Date(),
    ...overrides,
  })) as unknown as { _id: unknown; name: string };
  return { id: String(hotel._id), name: hotel.name };
}
