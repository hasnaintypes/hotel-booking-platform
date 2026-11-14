import { randomUUID } from "node:crypto";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ReconciliationRepository } from "../src/database/repositories/reconciliation.repository";
import { createTestApp, type TestApp } from "./support/create-app";
import {
  anonymous,
  insertBooking,
  insertHotel,
  registerAdmin,
  registerUser,
} from "./support/helpers";
import { routes } from "./support/routes";

type Agent = ReturnType<typeof request.agent>;

const DAY_MS = 24 * 60 * 60 * 1_000;

describe("admin booking operations", () => {
  let t: TestApp;
  let guest: Awaited<ReturnType<typeof registerUser>>;
  let owner: Awaited<ReturnType<typeof registerUser>>;
  let admin: Awaited<ReturnType<typeof registerAdmin>>;
  let hotelId: string;

  const bookingFor = (overrides: Record<string, unknown> = {}) =>
    insertBooking(t, guest.user._id, hotelId, overrides);

  const detail = (agent: Agent, id: string) => agent.get(routes.bookings.adminById(id));

  const createFinding = async (bookingId?: string) =>
    t.app.get(ReconciliationRepository).record({
      dedupeKey: `admin-ops:${randomUUID()}`,
      kind: "payment_status_mismatch",
      ...(bookingId ? { bookingId } : {}),
      details: { local: "paid", provider: "pending" },
    });

  beforeAll(async () => {
    t = await createTestApp();
    guest = await registerUser(t);
    owner = await registerUser(t);
    admin = await registerAdmin(t);
    hotelId = (await insertHotel(t, owner.user._id, { name: "Admin Ops Inn" })).id;
  });

  afterAll(async () => {
    await t.close();
  });

  describe("authorisation", () => {
    it("rejects anonymous requests to the queue and detail endpoints", async () => {
      const { id } = await bookingFor();

      expect((await anonymous(t).get(routes.bookings.list)).status).toBe(401);
      expect((await anonymous(t).get(routes.bookings.adminById(id))).status).toBe(401);
      expect((await anonymous(t).get(routes.reconciliation.discrepancies)).status).toBe(401);
    });

    it("rejects a signed-in guest from every manual action", async () => {
      const { id } = await bookingFor({ status: "needs_review", paymentStatus: "pending" });

      const responses = await Promise.all([
        guest.agent.get(routes.bookings.list),
        guest.agent.get(routes.bookings.adminById(id)),
        guest.agent.post(routes.bookings.adminRetry(id)).send({ reason: "retry the payment" }),
        guest.agent.post(routes.bookings.adminReview(id)).send({ reason: "checked it" }),
        guest.agent
          .post(routes.bookings.adminCancel(id))
          .set("Idempotency-Key", randomUUID())
          .send({ reason: "guest attempt" }),
        guest.agent.get(routes.reconciliation.discrepancies),
        guest.agent
          .patch(routes.reconciliation.discrepancy(id))
          .send({ status: "resolved", resolution: "checked" }),
      ]);

      for (const response of responses) {
        expect(response.status).toBe(403);
      }
    });
  });

  describe("bookings queue", () => {
    it("filters by status and hides bookings in other statuses", async () => {
      const confirmed = await bookingFor({ status: "confirmed" });
      const review = await bookingFor({ status: "needs_review", paymentStatus: "pending" });

      const response = await admin.agent
        .get(routes.bookings.list)
        .query({ status: "needs_review" });

      expect(response.status).toBe(200);
      const ids = response.body.map((booking: { _id: string }) => booking._id);
      expect(ids).toContain(review.id);
      expect(ids).not.toContain(confirmed.id);
    });

    it("searches guest name and rejects an unknown status", async () => {
      const marker = `Queue${Date.now()}`;
      const found = await bookingFor({ firstName: marker });

      const response = await admin.agent.get(routes.bookings.list).query({ q: marker });
      expect(response.status).toBe(200);
      expect(response.body.map((booking: { _id: string }) => booking._id)).toEqual([found.id]);

      const invalid = await admin.agent.get(routes.bookings.list).query({ status: "not-a-status" });
      expect(invalid.status).toBe(400);
    });

    it("returns the full detail with events, ledger and Stripe references", async () => {
      const { id } = await bookingFor({
        status: "confirmed",
        paymentStatus: "paid",
        stripePaymentIntentId: "pi_admin_detail",
      });

      const response = await detail(admin.agent, id);

      expect(response.status).toBe(200);
      expect(response.body.status).toBe("confirmed");
      expect(response.body.allowedTransitions).toContain("needs_review");
      expect(response.body.events).toHaveLength(1);
      expect(response.body.events[0]).toMatchObject({
        fromStatus: null,
        toStatus: "confirmed",
        reason: "test fixture",
      });
      expect(response.body.payments).toEqual([
        expect.objectContaining({
          kind: "charge",
          provider: "stripe",
          providerReference: "pi_admin_detail",
          status: "paid",
        }),
      ]);
      expect(response.body.stripePaymentIntentId).toBe("pi_admin_detail");
    });

    it("registration of an unknown booking id is a 404, not a direct write", async () => {
      const response = await detail(admin.agent, randomUUID());
      expect(response.status).toBe(404);
    });
  });

  describe("manual actions", () => {
    it("requires a written reason for retry and review", async () => {
      const { id } = await bookingFor({ status: "needs_review", paymentStatus: "pending" });

      for (const path of [routes.bookings.adminRetry, routes.bookings.adminReview]) {
        expect((await admin.agent.post(path(id)).send({})).status).toBe(400);
        expect((await admin.agent.post(path(id)).send({ reason: "  " })).status).toBe(400);
      }

      const cancelWithoutReason = await admin.agent
        .post(routes.bookings.adminCancel(id))
        .set("Idempotency-Key", randomUUID())
        .send({});
      expect(cancelWithoutReason.status).toBe(400);
    });

    it("rejects retry outside needs_review with a conflict", async () => {
      const { id } = await bookingFor({ status: "confirmed" });

      const response = await admin.agent
        .post(routes.bookings.adminRetry(id))
        .send({ reason: "Stripe shows the charge" });

      expect(response.status).toBe(409);
    });

    it("retries a paid booking, records the audit row and confirms the stay", async () => {
      const { id } = await bookingFor({
        status: "needs_review",
        paymentStatus: "paid",
        stripePaymentIntentId: "pi_retry_paid",
      });

      const response = await admin.agent
        .post(routes.bookings.adminRetry(id))
        .set("X-Request-Id", "retry-request-1")
        .send({ reason: "Stripe shows the charge" });

      expect(response.status).toBe(200);
      expect(response.body.status).toBe("confirmed");

      const retried = response.body.events.find(
        (event: { fromStatus?: string; toStatus: string }) =>
          event.fromStatus === "needs_review" && event.toStatus === "confirming",
      );
      expect(retried).toMatchObject({
        actorUserId: admin.user._id,
        reason: "Stripe shows the charge",
        requestId: "retry-request-1",
        metadata: { action: "retry", permission: "booking.retry" },
      });
    });

    it("marks a parked booking reviewed without changing its status", async () => {
      const { id } = await bookingFor({ status: "needs_review", paymentStatus: "pending" });

      const response = await admin.agent
        .post(routes.bookings.adminReview(id))
        .set("X-Request-Id", "review-request-1")
        .send({ reason: "Supplier confirmed the hold" });

      expect(response.status).toBe(200);
      expect(response.body.status).toBe("needs_review");

      const note = response.body.events.at(-1);
      expect(note).toMatchObject({
        fromStatus: "needs_review",
        toStatus: "needs_review",
        actorUserId: admin.user._id,
        reason: "Supplier confirmed the hold",
        requestId: "review-request-1",
        metadata: { kind: "note", permission: "booking.mark_reviewed" },
      });

      const refreshed = await detail(admin.agent, id);
      expect(refreshed.body.status).toBe("needs_review");
    });

    it("rejects marking reviewed unless the booking is parked", async () => {
      const { id } = await bookingFor({ status: "confirmed" });

      const response = await admin.agent
        .post(routes.bookings.adminReview(id))
        .send({ reason: "Nothing to review" });

      expect(response.status).toBe(409);
    });

    it("audits admin cancellation with the actor, reason and permission", async () => {
      const { id } = await bookingFor({
        status: "confirmed",
        paymentStatus: "pending",
        checkIn: new Date(Date.now() + 10 * DAY_MS),
      });

      const cancelled = await admin.agent
        .post(routes.bookings.adminCancel(id))
        .set("Idempotency-Key", randomUUID())
        .send({ reason: "Guest called to cancel" });
      expect(cancelled.status).toBe(200);
      expect(cancelled.body.booking.status).toBe("cancelled");

      const response = await detail(admin.agent, id);
      const cancelling = response.body.events.find(
        (event: { toStatus: string }) => event.toStatus === "cancelling",
      );
      expect(cancelling).toMatchObject({
        actorUserId: admin.user._id,
        reason: "Guest called to cancel",
        metadata: { permission: "booking.cancel", source: "admin-console" },
      });
    });
  });

  describe("removed direct-edit endpoints", () => {
    it("does not expose status or payment edits or a hard delete", async () => {
      const { id } = await bookingFor();

      const status = await admin.agent
        .patch(`/api/v1/admin/bookings/${id}/status`)
        .send({ status: "cancelled" });
      const payment = await admin.agent
        .patch(`/api/v1/admin/bookings/${id}/payment`)
        .send({ paymentStatus: "paid" });
      const removed = await admin.agent.delete(`/api/v1/admin/bookings/${id}`);

      expect([404, 405]).toContain(status.status);
      expect([404, 405]).toContain(payment.status);
      expect([404, 405]).toContain(removed.status);
    });
  });

  describe("discrepancy queue", () => {
    it("lists, filters, assigns and closes a finding with audit fields", async () => {
      const { id: bookingId } = await bookingFor();
      const finding = await createFinding(bookingId);
      expect(finding).toBeDefined();

      const list = await admin.agent
        .get(routes.reconciliation.discrepancies)
        .query({ status: "open", kind: "payment_status_mismatch" });
      expect(list.status).toBe(200);
      expect(list.body.map((row: { id: string }) => row.id)).toContain(finding!.id);

      const assigned = await admin.agent
        .patch(routes.reconciliation.discrepancy(finding!.id))
        .send({ assignedToUserId: admin.user._id });
      expect(assigned.status).toBe(200);
      expect(assigned.body).toMatchObject({
        assignedToUserId: admin.user._id,
        assignedByUserId: admin.user._id,
        status: "open",
      });

      const resolved = await admin.agent
        .patch(routes.reconciliation.discrepancy(finding!.id))
        .send({ status: "resolved", resolution: "Refund issued in Stripe" });
      expect(resolved.status).toBe(200);
      expect(resolved.body).toMatchObject({
        status: "resolved",
        resolution: "Refund issued in Stripe",
        resolvedByUserId: admin.user._id,
      });

      const again = await admin.agent
        .patch(routes.reconciliation.discrepancy(finding!.id))
        .send({ status: "ignored", resolution: "Wrong kind" });
      expect(again.status).toBe(409);
    });

    it("requires a resolution and an admin assignee", async () => {
      const finding = await createFinding();
      expect(finding).toBeDefined();

      const empty = await admin.agent
        .patch(routes.reconciliation.discrepancy(finding!.id))
        .send({});
      expect(empty.status).toBe(400);

      const noResolution = await admin.agent
        .patch(routes.reconciliation.discrepancy(finding!.id))
        .send({ status: "resolved" });
      expect(noResolution.status).toBe(400);

      const guestAssignee = await admin.agent
        .patch(routes.reconciliation.discrepancy(finding!.id))
        .send({ assignedToUserId: guest.user._id });
      expect(guestAssignee.status).toBe(400);
    });
  });
});
