import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestApp, type TestApp } from "./support/create-app";
import { anonymous, insertHotel, registerUser } from "./support/helpers";
import { routes } from "./support/routes";

describe("hotel search", () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
    const owner = await registerUser(t);
    const id = owner.user._id;

    await insertHotel(t, id, {
      name: "Rome Palace",
      city: "Rome",
      country: "Italy",
      pricePerNight: 300,
      starRating: 5,
      facilities: ["Pool", "WiFi"],
      type: ["Luxury"],
      adultCount: 4,
      childCount: 2,
    });
    await insertHotel(t, id, {
      name: "Paris Nook",
      city: "Paris",
      country: "France",
      pricePerNight: 120,
      starRating: 3,
      facilities: ["WiFi"],
      type: ["Budget"],
      adultCount: 2,
      childCount: 0,
    });
    await insertHotel(t, id, {
      name: "Ives Cottage",
      city: "St. Ives (Cornwall)",
      country: "United Kingdom",
      pricePerNight: 90,
      starRating: 4,
      facilities: ["Garden"],
      type: ["Cottage"],
      adultCount: 2,
      childCount: 1,
    });
    for (let i = 1; i <= 6; i += 1) {
      // Priced and rated so that they stay out of the price and star filter assertions below.
      await insertHotel(t, id, {
        name: `Oslo ${i}`,
        city: "Oslo",
        country: "Norway",
        pricePerNight: 200,
        starRating: 2,
      });
    }
    await insertHotel(t, id, { name: "Rome Hidden", city: "Rome", isActive: false });
  });
  afterAll(async () => {
    await t.close();
  });

  const search = (query: string) => anonymous(t).get(`${routes.hotels.search}?${query}`);
  const names = (res: { body: { data: { name: string }[] } }) => res.body.data.map((h) => h.name);

  it("treats the empty parameters the web client sends as not provided", async () => {
    const res = await search(
      "destination=&checkIn=&checkOut=&adultCount=&childCount=&page=&maxPrice=&sortOption=",
    );
    expect(res.status).toBe(200);
    expect(res.body.pagination).toMatchObject({ total: 9, page: 1, pages: 2 });
  });

  it("matches a destination against city or country, ignoring case", async () => {
    expect(names(await search("destination=rome"))).toEqual(["Rome Palace"]);
    expect(names(await search("destination=ITAL"))).toEqual(["Rome Palace"]);
  });

  it("matches regex-special characters literally", async () => {
    expect(names(await search("destination=St.%20Ives%20(Cornwall)"))).toEqual(["Ives Cottage"]);
    // `.` is not a wildcard and `.*` does not match everything.
    expect(names(await search("destination=Rom."))).toEqual([]);
    expect(names(await search("destination=.*"))).toEqual([]);
  });

  it("answers 200 with no results for input that would be an invalid or hostile pattern", async () => {
    for (const destination of ["[", "\\", "(a%2B)%2B%24", "%5E%24", "%2B", "%3F", "*"]) {
      const res = await search(`destination=${destination}`);
      expect(res.status).toBe(200);
      expect(res.body.data).toEqual([]);
    }
    // A lone "(" would be a syntax error as a pattern; as text it matches "St. Ives (Cornwall)".
    expect(names(await search("destination=("))).toEqual(["Ives Cottage"]);
  });

  it("filters by price, stars, facilities, types and guests", async () => {
    expect(names(await search("maxPrice=100"))).toEqual(["Ives Cottage"]);
    expect(names(await search("stars=5"))).toEqual(["Rome Palace"]);
    expect(
      (await search("stars=3&stars=4")).body.data.map((h: { name: string }) => h.name).sort(),
    ).toEqual(["Ives Cottage", "Paris Nook"]);
    expect(names(await search("facilities=Pool"))).toEqual(["Rome Palace"]);
    expect(names(await search("facilities=WiFi&facilities=Pool"))).toEqual(["Rome Palace"]);
    expect(names(await search("types=Budget"))).toEqual(["Paris Nook"]);
    expect(names(await search("adultCount=4"))).toEqual(["Rome Palace"]);
    expect(names(await search("destination=Italy&childCount=3"))).toEqual([]);
  });

  it("sorts by star rating and by price in both directions", async () => {
    const stars = await search("destination=a&sortOption=starRating");
    expect(names(stars)[0]).toBe("Rome Palace");

    const asc = await search("types=Luxury&types=Budget&types=Cottage&sortOption=pricePerNightAsc");
    expect(names(asc)).toEqual(["Ives Cottage", "Paris Nook", "Rome Palace"]);

    const desc = await search(
      "types=Luxury&types=Budget&types=Cottage&sortOption=pricePerNightDesc",
    );
    expect(names(desc)).toEqual(["Rome Palace", "Paris Nook", "Ives Cottage"]);
  });

  it("pages results five at a time", async () => {
    const first = await search("destination=Oslo");
    expect(first.body.data).toHaveLength(5);
    expect(first.body.pagination).toEqual({ total: 6, page: 1, pages: 2 });

    const second = await search("destination=Oslo&page=2");
    expect(second.body.data).toHaveLength(1);
    expect(second.body.pagination.page).toBe(2);
  });

  it.each([
    ["page=0", "page"],
    ["page=abc", "page"],
    ["page=1.5", "page"],
    ["page=1001", "page"],
    ["maxPrice=-1", "maxPrice"],
    ["maxPrice=abc", "maxPrice"],
    ["stars=9", "stars"],
    ["stars=abc", "stars"],
    ["adultCount=-1", "adultCount"],
    ["childCount=100", "childCount"],
    ["sortOption=drop", "sortOption"],
    [`destination=${"x".repeat(101)}`, "destination"],
  ])("rejects %s with a field-level 400", async (query, field) => {
    const res = await search(query);
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("VALIDATION_FAILED");
    expect(res.body.errors.map((e: { field: string }) => e.field)).toContain(field);
  });

  it("ignores operator-shaped query keys instead of passing them to the database", async () => {
    const baseline = await search("");
    for (const query of [
      "destination[$ne]=x",
      "types[$ne]=x",
      "stars[$gt]=0",
      "maxPrice[$gt]=0",
      "isActive=false",
    ]) {
      const res = await search(query);
      expect(res.status).toBe(200);
      expect(res.body.pagination.total).toBe(baseline.body.pagination.total);
    }
  });
});
