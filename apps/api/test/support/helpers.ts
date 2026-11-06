import request from "supertest";
import { eq } from "drizzle-orm";
import { hotels, type Database } from "@hotel-booking/db";
import type { TestApp } from "./create-app";
import { DATABASE } from "../../src/database/postgres.database";
import {
  HotelsRepository,
  type HotelWriteInput,
} from "../../src/database/repositories/hotels.repository";
import { UsersRepository } from "../../src/database/repositories/users.repository";
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
  await t.app.get(UsersRepository).updateRole(userId, "admin");
}

/** The PostgreSQL identity repository, for tests that need direct account state. */
export function usersRepository(t: TestApp) {
  return t.app.get(UsersRepository);
}

/** The PostgreSQL hotel repository, for tests that need direct hotel state. */
export function hotelsRepository(t: TestApp) {
  return t.app.get(HotelsRepository);
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

const DAY_MS = 24 * 60 * 60 * 1000;

/** Inserts a booking straight into the database, bypassing the Stripe payment flow. */
export async function insertBooking(
  t: TestApp,
  userId: string,
  hotelId: string,
  overrides: Record<string, unknown> = {},
) {
  const now = Date.now();
  const booking = (await t.connection.model("Booking").create({
    userId,
    hotelId,
    firstName: "Gus",
    lastName: "Guest",
    email: "guest@example.test",
    adultCount: 1,
    childCount: 0,
    checkIn: new Date(now + 10 * DAY_MS),
    checkOut: new Date(now + 12 * DAY_MS),
    totalCost: 200,
    status: "confirmed",
    paymentStatus: "paid",
    ...overrides,
  })) as unknown as { _id: unknown };
  return { id: String(booking._id) };
}

/** Inserts a hotel through the real PostgreSQL repository, bypassing the HTTP validation layer. */
export async function insertHotel(
  t: TestApp,
  ownerId: string,
  overrides: Record<string, unknown> = {},
) {
  hotelCounter += 1;
  const name = String(overrides.name ?? `Test Hotel ${hotelCounter}`);
  const input: HotelWriteInput = {
    name,
    city: String(overrides.city ?? "London"),
    country: String(overrides.country ?? "United Kingdom"),
    description: String(overrides.description ?? "A hotel used by the integration tests."),
    type: (overrides.type as string[] | undefined) ?? ["Hotel"],
    facilities: (overrides.facilities as string[] | undefined) ?? ["Free WiFi"],
    pricePerNight: Number(overrides.pricePerNight ?? 100),
    starRating: Number(overrides.starRating ?? 4),
    adultCount: Number(overrides.adultCount ?? 2),
    childCount: Number(overrides.childCount ?? 1),
    imageUrls: (overrides.imageUrls as string[] | undefined) ?? [
      "https://res.cloudinary.test/image-0.jpg",
    ],
  };

  const repo = hotelsRepository(t);
  const id = await repo.create(input, ownerId);
  if (overrides.isActive === false) {
    await repo.setStatus(id, false);
  }
  if (overrides.isFeatured === true) {
    await t.app
      .get<Database>(DATABASE)
      .update(hotels)
      .set({ isFeatured: true })
      .where(eq(hotels.id, id));
  }

  return { id, name };
}
