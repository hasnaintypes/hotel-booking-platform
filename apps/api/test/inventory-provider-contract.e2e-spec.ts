import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { InventoryProvider } from "../src/domain/inventory/inventory-provider";
import type { AvailabilityQuery } from "../src/domain/inventory/offer";
import { ManagedInventoryProvider } from "../src/modules/inventory/providers/managed-inventory.provider";
import { createTestApp, type TestApp } from "./support/create-app";
import { hotelsRepository, insertHotel, registerUser } from "./support/helpers";
import { MockSupplierInventoryProvider } from "./support/mock-supplier-inventory.provider";

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.now();
const CHECK_IN = new Date(NOW + 10 * DAY).toISOString();
const CHECK_OUT = new Date(NOW + 12 * DAY).toISOString();

/**
 * The contract both inventory implementations must satisfy. It is deliberately narrow: booking
 * code relies on a frozen offer with a selected rate, an expiry and a provider-agnostic identity,
 * plus reservation methods that are safe to call for sources that do not need them.
 */
function runInventoryProviderContract(
  name: string,
  createProvider: () => Promise<{ provider: InventoryProvider; query: AvailabilityQuery }>,
) {
  describe(`${name} honours the InventoryProvider contract`, () => {
    let provider: InventoryProvider;
    let query: AvailabilityQuery;

    beforeAll(async () => {
      ({ provider, query } = await createProvider());
    });

    it("searches a stay and returns a frozen offer", async () => {
      const offers = await provider.search(query);

      expect(offers.length).toBeGreaterThan(0);
      const offer = offers[0];
      expect(offer.source).toBe(provider.source);
      expect(offer.hotelId).toBe(query.hotelId);
      expect(offer.adultCount).toBe(query.adultCount);
      expect(offer.childCount).toBe(query.childCount);
      expect(offer.rateOptions.length).toBeGreaterThan(0);
      expect(offer.price.totalMinor).toBeGreaterThan(0);
      expect(offer.expiresAt.getTime()).toBeGreaterThan(Date.now());
      expect(offer.rateOptions.map((option) => option.id)).toContain(offer.selectedRateOptionId);
    });

    it("re-quotes without changing the selected price", async () => {
      const [first] = await provider.search(query);
      const quoted = await provider.quote(first);

      expect(quoted.price.totalMinor).toBe(first.price.totalMinor);
      expect(quoted.price.currency).toBe(first.price.currency);
      expect(quoted.expiresAt.getTime()).toBeGreaterThanOrEqual(first.expiresAt.getTime());
    });

    it("exposes reservation operations that are safe for every source", async () => {
      const [offer] = await provider.search(query);
      const inventory = {
        bookingId: "00000000-0000-0000-0000-000000000000",
        offerId: null,
        source: provider.source,
        supplierId: offer.supplierId ?? null,
        supplierReference: offer.supplierOfferId ?? null,
      };

      await expect(provider.hold(offer)).resolves.toBeDefined();
      await expect(provider.commit(offer)).resolves.toBeDefined();
      await expect(provider.book(offer)).resolves.toBeDefined();
      await expect(provider.release(offer)).resolves.toBeUndefined();
      await expect(provider.cancel(inventory)).resolves.toBeUndefined();
    });
  });
}

describe("inventory provider contract", () => {
  let t: TestApp;
  let managed: ManagedInventoryProvider;
  let hotelId: string;

  beforeAll(async () => {
    t = await createTestApp();
    managed = t.app.get(ManagedInventoryProvider);
    const owner = await registerUser(t);
    hotelId = (
      await insertHotel(t, owner.user._id, {
        pricePerNight: 125,
        adultCount: 2,
        childCount: 1,
      })
    ).id;
  });

  afterAll(async () => {
    await t.close();
  });

  const query = (): AvailabilityQuery => ({
    hotelId,
    checkIn: CHECK_IN,
    checkOut: CHECK_OUT,
    adultCount: 1,
    childCount: 0,
  });

  runInventoryProviderContract("managed inventory", async () => ({
    provider: managed,
    query: query(),
  }));

  runInventoryProviderContract("mock supplier", async () => ({
    provider: new MockSupplierInventoryProvider(hotelsRepository(t)),
    query: query(),
  }));
});
