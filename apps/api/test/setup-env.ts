import { randomUUID } from "node:crypto";

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

const base = process.env.TEST_MONGO_BASE_URI ?? "mongodb://127.0.0.1:27017";
process.env.MONGODB_CONNECTION_STRING = `${base}/test_${randomUUID().replace(/-/g, "")}`;
