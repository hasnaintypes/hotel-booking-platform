// Runs in every test worker before any application code is imported.
process.env.NODE_ENV = "test";
process.env.JWT_SECRET_KEY = "test-secret-key-that-is-long-enough-for-hs256";
process.env.CLOUDINARY_CLOUD_NAME = "test-cloud";
process.env.CLOUDINARY_API_KEY = "test-key";
process.env.CLOUDINARY_API_SECRET = "test-secret";
process.env.STRIPE_API_KEY = "sk_test_dummy";
process.env.FRONTEND_URL = "http://localhost:5174";
process.env.ADMIN_URL = "http://localhost:5175";
process.env.BACKEND_URL = "http://localhost:5001";
process.env.GOOGLE_ID = "test-google-client-id";
process.env.GOOGLE_SECRET = "test-google-client-secret";
process.env.AI_ASSIST_ENABLED = "false";
// Fast hashing, and limits high enough that ordinary tests never meet them. The tests of those
// limits lower them for the app they create.
process.env.BCRYPT_COST = "4";
process.env.AUTH_RATE_LIMIT = "1000";
process.env.AUTH_MAX_FAILED_LOGINS = "100";

// Tests that touch PostgreSQL must never reach a development database. TEST_DATABASE_URL wins;
// otherwise use the conventional disposable database that docker compose and CI provide.
process.env.TEST_DATABASE_URL ??= "postgres://postgres:postgres@localhost:5432/hotel_booking_test";
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
