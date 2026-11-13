import { expect, type Page } from "@playwright/test";
import { E2E, apiOrigin, stripeMockOrigin } from "./env";

/** A stay expressed the way the app's search URL and booking DTO accept it (calendar dates). */
export type Stay = {
  checkIn: string;
  checkOut: string;
  checkInLabel: string;
  checkOutLabel: string;
};

const pad = (value: number) => String(value).padStart(2, "0");
const dateOnly = (date: Date) =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

/** `toDateString()` of a calendar date, matching how My Bookings renders an ISO timestamp. */
const labelOf = (isoDate: string) => new Date(`${isoDate}T00:00:00.000Z`).toDateString();

/** A future stay, offset per spec so parallel or repeated runs never assert on the same rows. */
export const stayInFuture = (daysAhead: number, nights = 3): Stay => {
  const checkIn = new Date();
  checkIn.setHours(12, 0, 0, 0);
  checkIn.setDate(checkIn.getDate() + daysAhead);
  const checkOut = new Date(checkIn);
  checkOut.setDate(checkOut.getDate() + nights);

  const checkInIso = dateOnly(checkIn);
  const checkOutIso = dateOnly(checkOut);
  return {
    checkIn: checkInIso,
    checkOut: checkOutIso,
    checkInLabel: labelOf(checkInIso),
    checkOutLabel: labelOf(checkOutIso),
  };
};

export type BookingRow = {
  _id: string;
  publicReference: string;
  hotelId: string;
  checkIn: string;
  checkOut: string;
  status: string;
  paymentStatus: string;
  totalCost: number;
  refundAmount: number;
};

export type HotelBookings = {
  _id: string;
  name: string;
  bookings: BookingRow[];
};

/** The datepicker's default display format (MM/DD/YYYY). */
const displayDate = (isoDate: string) => {
  const [year, month, day] = isoDate.split("-");
  return `${month}/${day}/${year}`;
};

/** Signs in as the seeded guest through the real form. */
export async function signIn(page: Page): Promise<void> {
  await page.goto("/sign-in");
  await page.getByLabel("Email Address").fill(E2E.guestEmail);
  await page.getByLabel("Password").fill(E2E.seedPassword);
  await page.getByRole("button", { name: "Sign In" }).click();
  await expect(page.getByRole("link", { name: "Log In" })).toHaveCount(0);
}

/**
 * Searches London on the real search page, with future dates typed into the date pickers, opens
 * the seeded hotel and lands on the checkout form.
 */
export async function openCheckout(page: Page, stay: Stay): Promise<void> {
  await page.goto("/search");
  await page.getByPlaceholder("Where are you going?").fill(E2E.hotelCity);
  await page.getByPlaceholder("Check-in Date").fill(displayDate(stay.checkIn));
  await page.keyboard.press("Escape");
  await page.getByPlaceholder("Check-out Date").fill(displayDate(stay.checkOut));
  await page.keyboard.press("Escape");
  // The search bar falls back to 1 child when the context has no saved value, and the API hides
  // hotels without enough child capacity, so both counts are set explicitly.
  await page.getByRole("spinbutton").nth(0).fill("2");
  await page.getByRole("spinbutton").nth(1).fill("0");
  await page.getByRole("button", { name: "Search" }).click();

  const hotelLink = page.getByRole("link", { name: E2E.hotelName });
  await expect(hotelLink).toBeVisible();
  await hotelLink.click();

  await expect(page.getByText(E2E.hotelName, { exact: true }).first()).toBeVisible();
  await page.getByRole("button", { name: "Book Now" }).click();
  await expect(page.getByRole("heading", { name: "Complete Your Booking" })).toBeVisible();
}

/** Creates the booking and mounts the stubbed Payment Element. */
export async function continueToPayment(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Continue to payment" }).click();
  await expect(page.getByLabel("Card number")).toBeVisible();
}

export async function payWithCard(page: Page, cardNumber: string): Promise<void> {
  await page.getByLabel("Card number").fill(cardNumber);
  await page.getByLabel("Expiry").fill("12/35");
  await page.getByLabel("CVC").fill("123");
  await page.getByRole("button", { name: "Pay & confirm booking" }).click();
}

/** The reference shown on the booking status card. */
export async function bookingReference(page: Page): Promise<string> {
  const reference = page
    .locator("dt", { hasText: "Booking reference" })
    .locator("xpath=following-sibling::dd[1]");
  await expect(reference).toBeVisible();
  return (await reference.innerText()).trim();
}

export async function guestBookings(page: Page): Promise<HotelBookings[]> {
  const response = await page.request.get(`${apiOrigin}/api/v1/bookings`);
  expect(response.ok()).toBeTruthy();
  return (await response.json()) as HotelBookings[];
}

/** Rows for the stay under test, scoped to the seeded hotel. */
export async function bookingsForStay(page: Page, stay: Stay): Promise<BookingRow[]> {
  const hotels = await guestBookings(page);
  return hotels
    .filter((hotel) => hotel.name === E2E.hotelName)
    .flatMap((hotel) => hotel.bookings)
    .filter((booking) => booking.checkIn.startsWith(stay.checkIn));
}

export type MockPaymentIntent = {
  id: string;
  status: string;
  amount: number;
  amount_received: number;
  metadata: Record<string, string>;
};

/** The mock's own record, used to prove no second PaymentIntent was created. */
export async function mockPaymentIntents(page: Page): Promise<MockPaymentIntent[]> {
  const response = await page.request.get(`${stripeMockOrigin}/__mock/payment-intents`);
  expect(response.ok()).toBeTruthy();
  const body = (await response.json()) as { paymentIntents: MockPaymentIntent[] };
  return body.paymentIntents;
}

export async function paymentIntentsForBooking(
  page: Page,
  bookingId: string,
): Promise<MockPaymentIntent[]> {
  return (await mockPaymentIntents(page)).filter(
    (intent) => intent.metadata.bookingId === bookingId,
  );
}

/** Waits for the signed webhook to move the status card out of "Confirming". */
export async function expectConfirmed(page: Page): Promise<void> {
  await expect(page.getByText("Booking confirmed", { exact: true })).toBeVisible({
    timeout: 30_000,
  });
}

/**
 * Holds mock webhook delivery so the pre-webhook "Confirming" state is observable. The mock sends
 * the signed webhook inline with the payment confirmation by default, which beats any assertion.
 */
export async function holdWebhooks(page: Page): Promise<void> {
  const response = await page.request.post(`${stripeMockOrigin}/__mock/hold-webhooks`);
  expect(response.ok()).toBeTruthy();
}

/** Releases held webhooks and waits until the API has accepted them. */
export async function releaseWebhooks(page: Page): Promise<void> {
  const response = await page.request.post(`${stripeMockOrigin}/__mock/release-webhooks`);
  expect(response.ok()).toBeTruthy();
}

/** "Booking #XXXXXXXX" as My Bookings labels a row. */
export const myBookingsLabel = (bookingId: string): string =>
  `Booking #${bookingId.slice(-8).toUpperCase()}`;
