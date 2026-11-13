import { stripeMockOrigin } from "./support/env";
import { expect, test } from "./support/fixtures";
import {
  bookingReference,
  bookingsForStay,
  continueToPayment,
  expectConfirmed,
  holdWebhooks,
  myBookingsLabel,
  openCheckout,
  payWithCard,
  paymentIntentsForBooking,
  releaseWebhooks,
  signIn,
  stayInFuture,
  type BookingRow,
} from "./support/flow";

/**
 * The M2 acceptance path: a seeded guest signs in, searches London, books the seeded hotel with a
 * Stripe test card, watches the webhook move the booking to confirmed, finds it in My Bookings and
 * cancels it for a refund.
 */
test.describe("M2 checkout happy path", () => {
  // A failed assertion between hold and release would otherwise leave the mock holding webhooks.
  test.afterEach(async ({ page }) => {
    await releaseWebhooks(page).catch(() => undefined);
  });

  test("books with a test card, confirms, then cancels with a refund", async ({ page }) => {
    const stay = stayInFuture(120);

    await signIn(page);
    await openCheckout(page, stay);

    await page.getByPlaceholder("Enter your phone number").fill("+44 7700 900999");
    await page.getByPlaceholder(/Any special requests/).fill("Playwright end-to-end stay");

    await continueToPayment(page);

    const created = await bookingsForStay(page, stay);
    expect(created).toHaveLength(1);
    expect(created[0]?.status).toBe("pending_payment");

    await holdWebhooks(page);
    await payWithCard(page, "4242 4242 4242 4242");

    // The webhook has not been applied yet, so the page must show a non-committal state.
    await expect(page.getByText("Confirming your booking", { exact: true })).toBeVisible();
    await expect(page.getByText(/please don't pay again/i)).toBeVisible();

    await releaseWebhooks(page);
    await expectConfirmed(page);

    const reference = await bookingReference(page);
    expect(reference).toMatch(/^[a-z0-9]{16,64}$/);

    const [booking] = await bookingsForStay(page, stay);
    expect(booking).toBeDefined();
    expect(booking?.status).toBe("confirmed");
    expect(booking?.paymentStatus).toBe("paid");
    // One PaymentIntent for the booking, created once, not once per attempt.
    expect(await paymentIntentsForBooking(page, booking?._id as string)).toHaveLength(1);

    await page.getByRole("link", { name: "View My Bookings" }).click();

    const card = page
      .locator("div.border-slate-200")
      .filter({ hasText: myBookingsLabel(booking?._id as string) })
      .first();
    await expect(card).toBeVisible();
    await expect(card.getByText("confirmed", { exact: true })).toBeVisible();
    await expect(card.getByText("paid", { exact: true })).toBeVisible();
    await expect(card.getByText(stay.checkInLabel, { exact: false })).toBeVisible();

    await card.getByRole("button", { name: "Cancel booking" }).click();
    await card.getByPlaceholder("e.g. Change of plans").fill("Playwright e2e refund");
    await card.getByRole("button", { name: "Confirm cancel" }).click();

    await expect(page.getByText("Booking cancelled", { exact: true })).toBeVisible();
    await expect(card.getByText("cancelled", { exact: true })).toBeVisible();
    await expect(card.getByText(/Refund: £/)).toBeVisible();

    let cancelled: BookingRow | undefined;
    await expect
      .poll(async () => {
        [cancelled] = await bookingsForStay(page, stay);
        return cancelled?.status;
      })
      .toBe("cancelled");

    expect(cancelled?.paymentStatus).toBe("refunded");
    expect(cancelled?.refundAmount).toBeGreaterThan(0);
    expect(cancelled?.refundAmount).toBeCloseTo(booking?.totalCost as number, 2);

    // The refund went through the mock's Stripe refund endpoint exactly once.
    const [intent] = await paymentIntentsForBooking(page, booking?._id as string);
    const refundsResponse = await page.request.get(`${stripeMockOrigin}/__mock/refunds`);
    expect(refundsResponse.ok()).toBeTruthy();
    const refunds = (await refundsResponse.json()) as {
      refunds: Array<{ payment_intent: string; amount: number }>;
    };
    const bookingRefunds = refunds.refunds.filter((refund) => refund.payment_intent === intent?.id);
    expect(bookingRefunds).toHaveLength(1);
    expect(bookingRefunds[0]?.amount).toBe(Math.round((booking?.totalCost as number) * 100));
  });
});
