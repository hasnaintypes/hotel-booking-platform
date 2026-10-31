import { MongoMemoryServer } from "mongodb-memory-server";

let server: MongoMemoryServer | undefined;

/**
 * Provides one MongoDB for the whole test run. CI sets MONGODB_TEST_URI to a
 * service container; locally an in-memory server is started (the binary is
 * downloaded once and cached). Each test file uses its own database name.
 */
export async function setup() {
  if (process.env.MONGODB_TEST_URI) {
    process.env.TEST_MONGO_BASE_URI = process.env.MONGODB_TEST_URI.replace(/\/$/, "");
    return;
  }
  server = await MongoMemoryServer.create();
  process.env.TEST_MONGO_BASE_URI = server.getUri().replace(/\/$/, "");
}

export async function teardown() {
  await server?.stop();
}
