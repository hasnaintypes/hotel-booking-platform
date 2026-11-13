import { expect, test } from "./support/fixtures";
import {
  bookingsForStay,
  continueToPayment,
  expectConfirmed,
  openCheckout,
  payWithCard,
  paymentIntentsForBooking,
  signIn,
  stayInFuture,
} from "./support/flow";

/**
 * A declined card must not strand the guest or leave a second booking behind. The first attempt
 * is rejected, the form stays usable, and the retry reuses the same booking and PaymentIntent.
 */
test.describe("M2 checkout declined card", () => {
  test("shows the decline, keeps the form usable and never creates a second booking", async ({
    page,
  }) => {
    const stay = stayInFuture(150);

    await signIn(page);
    await openCheckout(page, stay);
    await continueToPayment(page);

    const created = await bookingsForStay(page, stay);
    expect(created).toHaveLength(1);
    const booking = created[0];
    expect(await paymentIntentsForBooking(page, booking?._id as string)).toHaveLength(1);

    await payWithCard(page, "4000 0000 0000 0002");

    await expect(page.getByRole("alert")).toContainText("Your card was declined.");
    // The guest can correct the card and try again: the form is not locked by a failed attempt.
    await expect(page.getByLabel("Card number")).toBeVisible();
    await expect(page.getByRole("button", { name: "Pay & confirm booking" })).toBeEnabled();

    expect(await bookingsForStay(page, stay)).toHaveLength(1);
    expect(await paymentIntentsForBooking(page, booking?._id as string)).toHaveLength(1);

    // A retry with a good card confirms the same booking and reuses the same PaymentIntent.
    await payWithCard(page, "4242 4242 4242 4242");
    await expectConfirmed(page);

    const afterRetry = await bookingsForStay(page, stay);
    expect(afterRetry).toHaveLength(1);
    expect(afterRetry[0]?._id).toBe(booking?._id);
    expect(afterRetry[0]?.status).toBe("confirmed");
    expect(afterRetry[0]?.paymentStatus).toBe("paid");
    expect(await paymentIntentsForBooking(page, booking?._id as string)).toHaveLength(1);
  });
});
