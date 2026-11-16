import { problemDetailsSchema } from "@hotel-booking/contracts";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestApp, type TestApp } from "./support/create-app";
import { insertHotel, registerAdmin } from "./support/helpers";
import { routes } from "./support/routes";

describe("conditional requests", () => {
  let t: TestApp;
  let admin: Awaited<ReturnType<typeof registerAdmin>>;
  let hotelId: string;

  beforeAll(async () => {
    t = await createTestApp();
    admin = await registerAdmin(t);
    const hotel = await insertHotel(t, admin.user._id, { name: "Conditional Inn" });
    hotelId = hotel.id;
  });

  afterAll(async () => {
    await t.close();
  });

  const read = () => admin.agent.get(routes.hotels.adminById(hotelId));

  it("returns an entity tag that identifies the representation", async () => {
    const first = await read().expect(200);
    const second = await read().expect(200);

    expect(first.headers.etag).toMatch(/^"[A-Za-z0-9_-]{27}"$/);
    expect(second.headers.etag).toBe(first.headers.etag);
  });

  it("answers a matching If-None-Match with 304 and no body", async () => {
    const { headers } = await read().expect(200);

    const res = await read().set("If-None-Match", headers.etag).expect(304);

    expect(res.text).toBe("");
    expect(res.body).toEqual({});
  });

  it("rejects a stale If-Match before writing anything", async () => {
    const stale = (await read().expect(200)).headers.etag;
    await admin.agent
      .patch(routes.hotels.adminById(hotelId))
      .set("If-Match", stale)
      .send({ isActive: false })
      .expect(200);

    const res = await admin.agent
      .patch(routes.hotels.adminById(hotelId))
      .set("If-Match", stale)
      .send({ isActive: true })
      .expect(412);

    expect(res.headers["content-type"]).toMatch(/problem\+json/);
    const problem = problemDetailsSchema.parse(res.body);
    expect(problem.status).toBe(412);
    expect(problem.code).toBe("PRECONDITION_FAILED");
    expect(problem.type).toBe("urn:hotel-booking:problem:precondition-failed");

    // The failed request must not have applied its change.
    const current = await read().expect(200);
    expect(current.body.isActive).toBe(false);
  });

  it("applies the change when If-Match is current", async () => {
    const { headers } = await read().expect(200);

    const res = await admin.agent
      .patch(routes.hotels.adminById(hotelId))
      .set("If-Match", headers.etag)
      .send({ isActive: true })
      .expect(200);

    expect(res.body.isActive).toBe(true);
  });

  it("still accepts an unconditional update, so existing clients keep working", async () => {
    const res = await admin.agent
      .patch(routes.hotels.adminById(hotelId))
      .send({ isActive: false })
      .expect(200);

    expect(res.body.isActive).toBe(false);
  });

  it("returns 404 for a conditional update of an unknown hotel", async () => {
    await admin.agent
      .patch(routes.hotels.adminById("0f8fad5b-d9cb-469f-a165-70867728950e"))
      .set("If-Match", '"stale"')
      .send({ isActive: true })
      .expect(404);
  });
});
