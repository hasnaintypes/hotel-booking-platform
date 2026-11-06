import { BadGatewayException } from "@nestjs/common";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestApp, type TestApp } from "./support/create-app";
import { hotelFields, jpegBytes, pngBytes, webpBytes } from "./support/hotel-form";
import { hotelsRepository, insertHotel, registerUser } from "./support/helpers";
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

  const stored = (id: string) => hotelsRepository(t).findById(id);
  const createHotel = (fields = hotelFields()) =>
    owner.agent.post(routes.myHotels.list).send(fields);
  const upload = (id: string, bytes = jpegBytes(), file = JPEG) =>
    owner.agent.post(routes.myHotels.images(id)).attach("imageFiles", bytes, file);
  const update = (id: string, fields = hotelFields()) =>
    owner.agent.patch(routes.myHotels.byId(id)).send(fields);

  describe("on create", () => {
    it("accepts a hotel with no images", async () => {
      const res = await createHotel();
      expect(res.status).toBe(201);
      expect(res.body.imageUrls).toEqual([]);
    });
  });

  describe("adding images", () => {
    it("accepts JPEG, PNG and WebP and stores HTTPS urls", async () => {
      const hotel = await insertHotel(t, owner.user._id, { imageUrls: [] });

      const res = await upload(hotel.id)
        .attach("imageFiles", pngBytes(), PNG)
        .attach("imageFiles", webpBytes(), WEBP);

      expect(res.status).toBe(201);
      expect(res.body.imageUrls).toHaveLength(3);
      for (const url of res.body.imageUrls) expect(url).toMatch(/^https:\/\//);
      expect(t.cloudinary.uploadImages).toHaveBeenCalledTimes(1);
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
      const hotel = await insertHotel(t, owner.user._id, { imageUrls: [] });
      const res = await upload(hotel.id, bytes, file);

      expect(res.status).toBe(400);
      expect(res.body.code).toBe("VALIDATION_FAILED");
      expect(res.body.errors.map((e: { field: string }) => e.field)).toContain("imageFiles");
      expect(t.cloudinary.uploadImages).not.toHaveBeenCalled();
      expect((await stored(hotel.id))?.images).toEqual([]);
    });

    it.each([
      ["HTML labelled as a PNG", Buffer.from("<html>" + " ".repeat(40)), PNG],
      ["a PNG labelled as a JPEG", pngBytes(), JPEG],
      ["a JPEG labelled as a PNG", jpegBytes(), PNG],
      ["an empty file labelled as a JPEG", Buffer.alloc(0), JPEG],
    ])("rejects %s by looking at the bytes", async (_name, bytes, file) => {
      const hotel = await insertHotel(t, owner.user._id, { imageUrls: [] });
      const res = await upload(hotel.id, bytes, file);

      expect(res.status).toBe(400);
      expect(res.body.code).toBe("VALIDATION_FAILED");
      expect(t.cloudinary.uploadImages).not.toHaveBeenCalled();
      expect((await stored(hotel.id))?.images).toEqual([]);
    });

    it("allows six images and refuses a seventh", async () => {
      const hotel = await insertHotel(t, owner.user._id, { imageUrls: [] });

      let request = owner.agent.post(routes.myHotels.images(hotel.id));
      for (let i = 0; i < 6; i += 1) request = request.attach("imageFiles", jpegBytes(), JPEG);
      expect((await request).status).toBe(201);

      let seventh = owner.agent.post(routes.myHotels.images(hotel.id));
      for (let i = 0; i < 7; i += 1) seventh = seventh.attach("imageFiles", jpegBytes(), JPEG);
      const res = await seventh;
      expect(res.status).toBe(400);
      expect(t.cloudinary.uploadImages).toHaveBeenCalledTimes(1);
    });

    it("answers 413 for a file over 5 MB", async () => {
      const hotel = await insertHotel(t, owner.user._id, { imageUrls: [] });
      const big = Buffer.concat([jpegBytes(), Buffer.alloc(5 * 1024 * 1024)]);
      const res = await upload(hotel.id, big, JPEG);

      expect(res.status).toBe(413);
      expect(res.body.code).toBe("PAYLOAD_TOO_LARGE");
      expect(t.cloudinary.uploadImages).not.toHaveBeenCalled();
    });

    it("answers 502 and stores nothing when the image service fails", async () => {
      t.cloudinary.uploadImages.mockRejectedValueOnce(
        new BadGatewayException("Image upload failed"),
      );
      const hotel = await insertHotel(t, owner.user._id, { imageUrls: [] });

      const res = await upload(hotel.id);

      expect(res.status).toBe(502);
      expect(res.body.code).toBe("UPSTREAM_ERROR");
      expect((await stored(hotel.id))?.images).toEqual([]);
    });

    it("uploads nothing for a hotel that belongs to someone else", async () => {
      const hotel = await insertHotel(t, other.user._id, { imageUrls: [] });
      const res = await upload(hotel.id);

      expect(res.status).toBe(404);
      expect(t.cloudinary.uploadImages).not.toHaveBeenCalled();
    });
  });

  describe("editing and removing images", () => {
    const urls = (n: number) => Array.from({ length: n }, (_, i) => `https://img.test/${i}.jpg`);

    it("adds new images before the kept ones", async () => {
      const hotel = await insertHotel(t, owner.user._id, { imageUrls: urls(2) });

      const res = await upload(hotel.id);

      expect(res.status).toBe(201);
      expect(res.body.imageUrls).toEqual(["https://res.cloudinary.test/image-0.jpg", ...urls(2)]);
    });

    it("saves the shorter list when images are removed", async () => {
      const hotel = await insertHotel(t, owner.user._id, { imageUrls: urls(3) });

      const res = await update(hotel.id, hotelFields({ imageUrls: [urls(3)[0]] }));

      expect(res.status).toBe(200);
      expect(res.body.imageUrls).toEqual([urls(3)[0]]);
      expect((await stored(hotel.id))?.images).toEqual([urls(3)[0]]);
    });

    it("removes one image through the sub-resource", async () => {
      const hotel = await insertHotel(t, owner.user._id, { imageUrls: urls(2) });

      const res = await owner.agent
        .delete(routes.myHotels.images(hotel.id))
        .send({ url: urls(2)[0] });

      expect(res.status).toBe(200);
      expect(res.body.imageUrls).toEqual([urls(2)[1]]);
      expect((await stored(hotel.id))?.images).toEqual([urls(2)[1]]);
    });

    it("leaves the images alone when the form sends no image fields", async () => {
      const hotel = await insertHotel(t, owner.user._id, { imageUrls: urls(2) });

      const res = await update(hotel.id);

      expect(res.status).toBe(200);
      expect(res.body.imageUrls).toEqual(urls(2));
    });

    it("refuses more than six images in total and changes nothing", async () => {
      const hotel = await insertHotel(t, owner.user._id, { name: "Full", imageUrls: urls(5) });

      let request = owner.agent.post(routes.myHotels.images(hotel.id));
      request = request.attach("imageFiles", jpegBytes(), JPEG);
      request = request.attach("imageFiles", jpegBytes(), JPEG);
      const res = await request;

      expect(res.status).toBe(400);
      expect(res.body.errors.map((e: { field: string }) => e.field)).toContain("imageFiles");
      expect(t.cloudinary.uploadImages).not.toHaveBeenCalled();
      expect((await stored(hotel.id))?.name).toBe("Full");
      expect((await stored(hotel.id))?.images).toEqual(urls(5));
    });

    it("refuses to keep an image that is not one of the hotel's", async () => {
      const hotel = await insertHotel(t, owner.user._id, { imageUrls: urls(1) });

      const res = await update(hotel.id, hotelFields({ imageUrls: ["https://evil.test/x.jpg"] }));

      expect(res.status).toBe(400);
      expect(res.body.errors.map((e: { field: string }) => e.field)).toContain("imageUrls");
      expect((await stored(hotel.id))?.images).toEqual(urls(1));
    });

    it("refuses to remove an image that is not one of the hotel's", async () => {
      const hotel = await insertHotel(t, owner.user._id, { imageUrls: urls(1) });

      const res = await owner.agent
        .delete(routes.myHotels.images(hotel.id))
        .send({ url: "https://evil.test/x.jpg" });

      expect(res.status).toBe(400);
      expect((await stored(hotel.id))?.images).toEqual(urls(1));
    });

    it("rejects a non-image upload without touching the hotel", async () => {
      const hotel = await insertHotel(t, owner.user._id, { name: "Before", imageUrls: [] });

      const res = await upload(hotel.id, Buffer.from("<html>" + " ".repeat(40)));

      expect(res.status).toBe(400);
      expect(t.cloudinary.uploadImages).not.toHaveBeenCalled();
      expect((await stored(hotel.id))?.name).toBe("Before");
    });
  });
});
