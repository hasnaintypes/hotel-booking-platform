import { NotFoundException } from "@nestjs/common";
import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { ValidationFailedException } from "../../common/errors/validation-failed.exception";
import type { HotelFormDto } from "./dto/hotel-form.dto";
import { MyHotelsService } from "./my-hotels.service";

const padded = (header: number[]) => Buffer.concat([Buffer.from(header), Buffer.alloc(32, 1)]);
const jpegFile = () =>
  ({ buffer: padded([0xff, 0xd8, 0xff, 0xe0]), mimetype: "image/jpeg" }) as Express.Multer.File;
const badFile = () =>
  ({
    buffer: Buffer.from("<html></html>".padEnd(40)),
    mimetype: "image/jpeg",
  }) as Express.Multer.File;

const dto = (overrides: Partial<HotelFormDto> = {}) =>
  ({
    name: "Hotel",
    city: "Bristol",
    country: "UK",
    description: "Nice",
    type: ["Hotel"],
    facilities: ["Pool"],
    pricePerNight: 100,
    starRating: 4,
    adultCount: 2,
    childCount: 1,
    ...overrides,
  }) as HotelFormDto;

describe("MyHotelsService image handling", () => {
  const existing = { imageUrls: ["https://img.test/old-1.jpg", "https://img.test/old-2.jpg"] };
  const uploaded = [{ url: "https://img.test/new-1.jpg", publicId: "folder/new-1" }];

  type AnyMock = Mock<(...args: any[]) => any>;
  let save: AnyMock;
  let findOne: AnyMock;
  let findByIdAndUpdate: AnyMock;
  let cloudinary: { uploadImages: AnyMock; deleteImages: AnyMock };
  let service: MyHotelsService;

  beforeEach(() => {
    save = vi.fn().mockResolvedValue(undefined);
    findOne = vi.fn().mockResolvedValue(existing);
    findByIdAndUpdate = vi.fn().mockImplementation(async (_id, update) => ({ ...update }));

    class FakeHotel {
      static findOne = (...args: unknown[]) => findOne(...args);
      static findByIdAndUpdate = (...args: unknown[]) => findByIdAndUpdate(...args);
      constructor(public data: Record<string, unknown>) {}
      save = () => save();
    }

    cloudinary = {
      // Like the real service: nothing to upload means nothing comes back.
      uploadImages: vi.fn(async (files: unknown[]) => (files.length > 0 ? uploaded : [])),
      deleteImages: vi.fn().mockResolvedValue(undefined),
    };
    service = new MyHotelsService(
      FakeHotel as never,
      {} as never,
      {} as never,
      cloudinary as never,
    );
  });

  describe("create", () => {
    it("keeps the uploaded images when the hotel is saved", async () => {
      const hotel = (await service.create(dto(), [jpegFile()], "owner-1")) as never as {
        data: { imageUrls: string[] };
      };

      expect(hotel.data.imageUrls).toEqual(["https://img.test/new-1.jpg"]);
      expect(cloudinary.deleteImages).not.toHaveBeenCalled();
    });

    it("deletes the uploaded images when saving the hotel fails", async () => {
      save.mockRejectedValueOnce(new Error("db down"));

      await expect(service.create(dto(), [jpegFile()], "owner-1")).rejects.toThrow("db down");

      expect(cloudinary.deleteImages).toHaveBeenCalledWith(["folder/new-1"]);
    });

    it("rejects a file that is not really an image before uploading anything", async () => {
      await expect(service.create(dto(), [badFile()], "owner-1")).rejects.toBeInstanceOf(
        ValidationFailedException,
      );
      expect(cloudinary.uploadImages).not.toHaveBeenCalled();
    });
  });

  describe("update", () => {
    it("leaves the images alone when the form sent none", async () => {
      await service.update("h1", dto(), [], "owner-1");

      expect(findByIdAndUpdate.mock.calls[0][1]).not.toHaveProperty("imageUrls");
      expect(cloudinary.uploadImages).toHaveBeenCalledWith([]);
    });

    it("saves the kept list when images were removed and none added", async () => {
      await service.update("h1", dto({ imageUrls: [existing.imageUrls[0]] }), [], "owner-1");

      expect(findByIdAndUpdate.mock.calls[0][1].imageUrls).toEqual([existing.imageUrls[0]]);
    });

    it("puts new images before the kept ones", async () => {
      await service.update("h1", dto({ imageUrls: [existing.imageUrls[0]] }), [jpegFile()], "o");

      expect(findByIdAndUpdate.mock.calls[0][1].imageUrls).toEqual([
        "https://img.test/new-1.jpg",
        existing.imageUrls[0],
      ]);
    });

    it("refuses to keep an image that does not belong to the hotel", async () => {
      await expect(
        service.update("h1", dto({ imageUrls: ["https://evil.test/x.jpg"] }), [], "owner-1"),
      ).rejects.toBeInstanceOf(ValidationFailedException);
      expect(cloudinary.uploadImages).not.toHaveBeenCalled();
    });

    it("refuses more than six images in total before uploading", async () => {
      const kept = Array.from({ length: 6 }, (_, i) => `https://img.test/${i}.jpg`);
      findOne.mockResolvedValueOnce({ imageUrls: kept });

      await expect(
        service.update("h1", dto({ imageUrls: kept }), [jpegFile()], "owner-1"),
      ).rejects.toBeInstanceOf(ValidationFailedException);
      expect(cloudinary.uploadImages).not.toHaveBeenCalled();
    });

    it("deletes the new uploads when the update fails", async () => {
      findByIdAndUpdate.mockRejectedValueOnce(new Error("db down"));

      await expect(service.update("h1", dto(), [jpegFile()], "owner-1")).rejects.toThrow("db down");

      expect(cloudinary.deleteImages).toHaveBeenCalledWith(["folder/new-1"]);
    });

    it("deletes the new uploads when the hotel disappears during the update", async () => {
      findByIdAndUpdate.mockResolvedValueOnce(null);

      await expect(service.update("h1", dto(), [jpegFile()], "owner-1")).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(cloudinary.deleteImages).toHaveBeenCalledWith(["folder/new-1"]);
    });

    it("does not upload anything for a hotel the user does not own", async () => {
      findOne.mockResolvedValueOnce(null);

      await expect(service.update("h1", dto(), [jpegFile()], "intruder")).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(cloudinary.uploadImages).not.toHaveBeenCalled();
    });
  });
});
