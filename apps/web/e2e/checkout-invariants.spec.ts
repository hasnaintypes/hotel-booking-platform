import { expect, test } from "./support/fixtures";
import {
  bookingsForStay,
  continueToPayment,
  openCheckout,
  payWithCard,
  paymentIntentsForBooking,
  signIn,
  stayInFuture,
} from "./support/flow";

/**
 * #55's checkout invariants, exercised through the browser rather than the API suite:
 *  - reloading during checkout replays the session idempotency key, never creating a booking twice
 *  - once the payment outcome is unknown the page must not invite a second payment
 *
 * A replay returns the stored creation response, so the guest lands back on the same booking and the
 * same PaymentIntent. That is the guarantee worth asserting: one booking and one intent, never two.
 */
test.describe("M2 checkout replay invariants", () => {
  test("a reload after the booking was created does not create a second booking", async ({
    page,
  }) => {
    const stay = stayInFuture(180);

    await signIn(page);
    await openCheckout(page, stay);
    await continueToPayment(page);

    const created = await bookingsForStay(page, stay);
    expect(created).toHaveLength(1);
    const booking = created[0];
    const intentsBefore = await paymentIntentsForBooking(page, booking?._id as string);
    expect(intentsBefore).toHaveLength(1);

    await page.reload();
    await expect(page.getByRole("button", { name: "Continue to payment" })).toBeVisible();
    await page.getByRole("button", { name: "Continue to payment" }).click();

    // The replayed create returns the same booking and client secret, so the guest is neither
    // stranded nor charged again; a second payable form would mean a second PaymentIntent.
    await expect(page.getByLabel("Card number")).toBeVisible();

    const afterReload = await bookingsForStay(page, stay);
    expect(afterReload).toHaveLength(1);
    expect(afterReload[0]?._id).toBe(booking?._id);

    const intentsAfter = await paymentIntentsForBooking(page, booking?._id as string);
    expect(intentsAfter).toHaveLength(1);
    expect(intentsAfter[0]?.id).toBe(intentsBefore[0]?.id);
    // Nothing was charged by reloading and replaying the checkout.
    expect(intentsAfter[0]?.status).toBe("requires_payment_method");
  });

  test("an unknown payment outcome blocks paying again", async ({ page }) => {
    const stay = stayInFuture(210);

    await signIn(page);
    await openCheckout(page, stay);
    await continueToPayment(page);

    const created = await bookingsForStay(page, stay);
    expect(created).toHaveLength(1);
    const booking = created[0];

    // 4000 0000 0000 3220 returns "requires_action": the challenge was interrupted, so the
    // outcome is unknown and the page must poll rather than unlock the form.
    await payWithCard(page, "4000 0000 0000 3220");

    await expect(page.getByText("Confirming your booking", { exact: true })).toBeVisible();
    await expect(page.getByText(/please don't pay again/i)).toBeVisible();
    await expect(page.getByRole("button", { name: "Pay & confirm booking" })).toHaveCount(0);

    // Stay on the page through at least one poll interval: the card must keep saying "confirming".
    await page.waitForTimeout(2_500);
    await expect(page.getByText("Confirming your booking", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Pay & confirm booking" })).toHaveCount(0);

    // Reloading and retrying the create replays the key: same booking, same single PaymentIntent
    // (still awaiting action), so no second charge can be started.
    await page.reload();
    await page.getByRole("button", { name: "Continue to payment" }).click();
    await expect(page.getByLabel("Card number")).toBeVisible();

    const afterReload = await bookingsForStay(page, stay);
    expect(afterReload).toHaveLength(1);
    expect(afterReload[0]?._id).toBe(booking?._id);

    const intents = await paymentIntentsForBooking(page, booking?._id as string);
    expect(intents).toHaveLength(1);
    expect(intents[0]?.status).toBe("requires_action");
    // The interrupted attempt never took money, and nothing new was charged on reload.
    expect(intents[0]?.amount_received).toBe(0);
  });
});
