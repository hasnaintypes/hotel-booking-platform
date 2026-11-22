import type { z } from "zod";
import { describe, expectTypeOf, it } from "vitest";
import { cancellationPolicySchema, offerSchema, rollupSchema } from "@hotel-booking/contracts";
import type { CancellationPolicy } from "@hotel-booking/pricing";
import type { RollupResponse } from "../../database/repositories/analytics.repository";
import type { OfferResponse } from "./offer-response";

/**
 * `packages/contracts` depends only on Zod, so the cancellation policy is declared there rather
 * than imported from `@hotel-booking/pricing`. These assertions fail to compile if the two drift.
 */
describe("response contract compatibility", () => {
  it("keeps the declared cancellation policy aligned with pricing", () => {
    expectTypeOf<CancellationPolicy>().toExtend<z.infer<typeof cancellationPolicySchema>>();
  });

  it("keeps the offer mapper inside the offer contract", () => {
    expectTypeOf<OfferResponse>().toExtend<z.infer<typeof offerSchema>>();
  });

  it("keeps the rollup mapper inside the rollup contract", () => {
    expectTypeOf<RollupResponse>().toExtend<z.infer<typeof rollupSchema>>();
  });
});
