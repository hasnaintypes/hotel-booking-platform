CREATE DATABASE hotel_booking_test;
-- Disposable database for the Playwright suite (apps/web/e2e). Kept separate from
-- hotel_booking_test so the API's Vitest harness and the browser suite never collide.
CREATE DATABASE hotel_booking_e2e;
