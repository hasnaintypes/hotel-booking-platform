import { BadGatewayException } from "@nestjs/common";
import { Types } from "mongoose";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestApp, type TestApp } from "./support/create-app";
import { applyFields, hotelFields, jpegBytes, pngBytes, webpBytes } from "./support/hotel-form";
import { insertHotel, registerUser } from "./support/helpers";
import { routes } from "./support/routes";

const JPEG = { filename: "photo.jpg", contentType: "image/jpeg" };
const PNG = { filename: "photo.png", contentType: "image/png" };
const WEBP = { filename: "photo.webp", contentType: "image/webp" };

describe("hotel image uploads", () => {
  let t: TestApp;
  let owner: Awaited<ReturnType<typeof registerUser>>;
  let other: Awaited<ReturnType<typeof registerUser>>;

  beforeAll(async () => {
    t = await createTestApp();
    owner = await registerUser(t);
    other = await registerUser(t);
  });
  afterAll(async () => {
    await t.close();
  });

  beforeEach(() => {
    t.cloudinary.uploadImages.mockClear();
    t.cloudinary.deleteImages.mockClear();
  });

  const hotelCount = () => t.connection.collection("hotels").countDocuments();
  const stored = (id: string) =>
    t.connection.collection("hotels").findOne({ _id: new Types.ObjectId(id) });
  const create = () => applyFields(owner.agent.post(routes.myHotels.list), hotelFields());
  const update = (id: string, fields = hotelFields()) =>
    applyFields(owner.agent.put(routes.myHotels.byId(id)), fields);

  describe("on create", () => {
    it("accepts JPEG, PNG and WebP and stores HTTPS urls", async () => {
      const res = await create()
        .attach("imageFiles", jpegBytes(), JPEG)
        .attach("imageFiles", pngBytes(), PNG)
        .attach("imageFiles", webpBytes(), WEBP);

      expect(res.status).toBe(201);
      expect(res.body.imageUrls).toHaveLength(3);
      for (const url of res.body.imageUrls) expect(url).toMatch(/^https:\/\//);
      expect(t.cloudinary.uploadImages).toHaveBeenCalledTimes(1);
    });

    it("accepts a hotel with no images", async () => {
      const res = await create();
      expect(res.status).toBe(201);
      expect(res.body.imageUrls).toEqual([]);
    });

    it.each([
      [
        "a file that is not an image type",
        Buffer.from("hello"),
        { filename: "a.txt", contentType: "text/plain" },
      ],
      ["an SVG", Buffer.from("<svg></svg>"), { filename: "a.svg", contentType: "image/svg+xml" }],
      [
        "a GIF",
        Buffer.from("GIF89a" + "x".repeat(30)),
        { filename: "a.gif", contentType: "image/gif" },
      ],
      [
        "a PDF",
        Buffer.from("%PDF-1.4" + " ".repeat(30)),
        { filename: "a.pdf", contentType: "application/pdf" },
      ],
    ])("rejects %s", async (_name, bytes, file) => {
      const before = await hotelCount();
      const res = await create().attach("imageFiles", bytes, file);

      expect(res.status).toBe(400);
      expect(res.body.code).toBe("VALIDATION_FAILED");
      expect(res.body.errors.map((e: { field: string }) => e.field)).toContain("imageFiles");
      expect(t.cloudinary.uploadImages).not.toHaveBeenCalled();
      expect(await hotelCount()).toBe(before);
    });

    it.each([
      ["HTML labelled as a PNG", Buffer.from("<html>" + " ".repeat(40)), PNG],
      ["a PNG labelled as a JPEG", pngBytes(), JPEG],
      ["a JPEG labelled as a PNG", jpegBytes(), PNG],
      ["an empty file labelled as a JPEG", Buffer.alloc(0), JPEG],
    ])("rejects %s by looking at the bytes", async (_name, bytes, file) => {
      const before = await hotelCount();
      const res = await create().attach("imageFiles", bytes, file);

      expect(res.status).toBe(400);
      expect(res.body.code).toBe("VALIDATION_FAILED");
      expect(t.cloudinary.uploadImages).not.toHaveBeenCalled();
      expect(await hotelCount()).toBe(before);
    });

    it("allows six images and refuses a seventh", async () => {
      const six = Array.from({ length: 6 }, () => jpegBytes());
      let request = create();
      for (const bytes of six) request = request.attach("imageFiles", bytes, JPEG);
      expect((await request).status).toBe(201);

      let seven = create();
      for (const bytes of [...six, jpegBytes()]) seven = seven.attach("imageFiles", bytes, JPEG);
      const res = await seven;
      expect(res.status).toBe(400);
      expect(t.cloudinary.uploadImages).toHaveBeenCalledTimes(1);
    });

    it("answers 413 for a file over 5 MB", async () => {
      const big = Buffer.concat([jpegBytes(), Buffer.alloc(5 * 1024 * 1024)]);
      const res = await create().attach("imageFiles", big, JPEG);

      expect(res.status).toBe(413);
      expect(res.body.code).toBe("PAYLOAD_TOO_LARGE");
      expect(t.cloudinary.uploadImages).not.toHaveBeenCalled();
    });

    it("validates the rest of the form before uploading anything", async () => {
      const res = await applyFields(
        owner.agent.post(routes.myHotels.list),
        hotelFields({ name: "" }),
      ).attach("imageFiles", jpegBytes(), JPEG);

      expect(res.status).toBe(400);
      expect(t.cloudinary.uploadImages).not.toHaveBeenCalled();
    });

    it("answers 502 and creates nothing when the image service fails", async () => {
      t.cloudinary.uploadImages.mockRejectedValueOnce(
        new BadGatewayException("Image upload failed"),
      );
      const before = await hotelCount();

      const res = await create().attach("imageFiles", jpegBytes(), JPEG);

      expect(res.status).toBe(502);
      expect(res.body.code).toBe("UPSTREAM_ERROR");
      expect(await hotelCount()).toBe(before);
    });
  });

  describe("on update", () => {
    const urls = (n: number) => Array.from({ length: n }, (_, i) => `https://img.test/${i}.jpg`);

    it("adds new images to the ones it keeps, new ones first", async () => {
      const hotel = await insertHotel(t, owner.user._id, { imageUrls: urls(2) });

      const res = await update(hotel.id, hotelFields({ imageUrls: [urls(2)[1]] })).attach(
        "imageFiles",
        jpegBytes(),
        JPEG,
      );

      expect(res.status).toBe(200);
      expect(res.body.imageUrls).toEqual(["https://res.cloudinary.test/image-0.jpg", urls(2)[1]]);
    });

    it("saves the shorter list when images are removed and none are added", async () => {
      const hotel = await insertHotel(t, owner.user._id, { imageUrls: urls(3) });

      const res = await update(hotel.id, hotelFields({ imageUrls: [urls(3)[0]] }));

      expect(res.status).toBe(200);
      expect(res.body.imageUrls).toEqual([urls(3)[0]]);
      expect((await stored(hotel.id))?.imageUrls).toEqual([urls(3)[0]]);
    });

    it("leaves the images alone when the form sends no image fields", async () => {
      const hotel = await insertHotel(t, owner.user._id, { imageUrls: urls(2) });

      const res = await update(hotel.id);

      expect(res.status).toBe(200);
      expect(res.body.imageUrls).toEqual(urls(2));
    });

    it("refuses more than six images in total and changes nothing", async () => {
      const hotel = await insertHotel(t, owner.user._id, { name: "Full", imageUrls: urls(5) });

      const res = await update(hotel.id, hotelFields({ name: "Renamed", imageUrls: urls(5) }))
        .attach("imageFiles", jpegBytes(), JPEG)
        .attach("imageFiles", jpegBytes(), JPEG);

      expect(res.status).toBe(400);
      expect(res.body.errors.map((e: { field: string }) => e.field)).toContain("imageFiles");
      expect(t.cloudinary.uploadImages).not.toHaveBeenCalled();
      expect(await stored(hotel.id)).toMatchObject({ name: "Full", imageUrls: urls(5) });
    });

    it("allows exactly six images in total", async () => {
      const hotel = await insertHotel(t, owner.user._id, { imageUrls: urls(4) });

      const res = await update(hotel.id, hotelFields({ imageUrls: urls(4) }))
        .attach("imageFiles", jpegBytes(), JPEG)
        .attach("imageFiles", jpegBytes(), JPEG);

      expect(res.status).toBe(200);
      expect(res.body.imageUrls).toHaveLength(6);
    });

    it("refuses to keep an image that is not one of the hotel's", async () => {
      const hotel = await insertHotel(t, owner.user._id, { imageUrls: urls(1) });

      const res = await update(hotel.id, hotelFields({ imageUrls: ["https://evil.test/x.jpg"] }));

      expect(res.status).toBe(400);
      expect(res.body.errors.map((e: { field: string }) => e.field)).toContain("imageUrls");
      expect((await stored(hotel.id))?.imageUrls).toEqual(urls(1));
    });

    it("rejects a non-image upload without touching the hotel", async () => {
      const hotel = await insertHotel(t, owner.user._id, { name: "Before" });

      const res = await update(hotel.id, hotelFields({ name: "After" })).attach(
        "imageFiles",
        Buffer.from("<html>" + " ".repeat(40)),
        JPEG,
      );

      expect(res.status).toBe(400);
      expect(t.cloudinary.uploadImages).not.toHaveBeenCalled();
      expect((await stored(hotel.id))?.name).toBe("Before");
    });

    it("uploads nothing for a hotel that belongs to someone else", async () => {
      const hotel = await insertHotel(t, other.user._id);

      const res = await update(hotel.id).attach("imageFiles", jpegBytes(), JPEG);

      expect(res.status).toBe(404);
      expect(t.cloudinary.uploadImages).not.toHaveBeenCalled();
    });
  });
});
