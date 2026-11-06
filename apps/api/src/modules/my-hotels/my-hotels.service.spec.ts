import { NotFoundException } from "@nestjs/common";
import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { ValidationFailedException } from "../../common/errors/validation-failed.exception";
import type { HotelRecord } from "../../database/repositories/hotels.repository";
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

const record = (imageUrls: string[] = []): HotelRecord =>
  ({
    id: "11111111-1111-4111-8111-111111111111",
    source: "managed",
    ownerUserId: "owner-1",
    createdByUserId: "owner-1",
    name: "Hotel",
    description: "Nice",
    city: "Bristol",
    country: "UK",
    countryCode: "GB",
    starRating: 4,
    pricePerNightMinor: 10000,
    currencyCode: "GBP",
    status: "active",
    isFeatured: false,
    adultCount: 2,
    childCount: 1,
    contactPhone: "",
    contactEmail: "",
    contactWebsite: "",
    checkInTime: "",
    checkOutTime: "",
    cancellationPolicy: "",
    petPolicy: "",
    smokingPolicy: "",
    addressLine1: null,
    state: null,
    postalCode: null,
    latitude: null,
    longitude: null,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
    images: imageUrls,
    facilities: ["Pool"],
    types: ["Hotel"],
  }) as HotelRecord;

describe("MyHotelsService image handling", () => {
  const uploaded = [{ url: "https://img.test/new-1.jpg", publicId: "folder/new-1" }];

  type AnyMock = Mock<(...args: any[]) => any>;
  let repo: {
    create: AnyMock;
    update: AnyMock;
    findOwnedById: AnyMock;
    addImages: AnyMock;
    removeImage: AnyMock;
  };
  let cloudinary: { uploadImages: AnyMock; deleteImages: AnyMock };
  let service: MyHotelsService;

  beforeEach(() => {
    repo = {
      create: vi.fn().mockResolvedValue(record().id),
      update: vi.fn().mockResolvedValue(record().id),
      findOwnedById: vi.fn().mockResolvedValue(record(["https://img.test/old-1.jpg"])),
      addImages: vi.fn().mockResolvedValue(undefined),
      removeImage: vi.fn().mockResolvedValue(undefined),
    };

    cloudinary = {
      uploadImages: vi.fn(async (files: unknown[]) => (files.length > 0 ? uploaded : [])),
      deleteImages: vi.fn().mockResolvedValue(undefined),
    };

    service = new MyHotelsService(
      repo as never,
      {
        forHotel: vi.fn().mockResolvedValue({
          totalBookings: 0,
          totalRevenue: 0,
          averageRating: 0,
          reviewCount: 0,
        }),
      } as never,
      cloudinary as never,
    );
  });

  describe("create", () => {
    it("passes image URLs from the JSON body to the repository", async () => {
      await service.create(dto({ imageUrls: ["https://img.test/a.jpg"] }), "owner-1");

      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({ imageUrls: ["https://img.test/a.jpg"] }),
        "owner-1",
      );
    });
  });

  describe("update", () => {
    it("leaves the images alone when the form sent none", async () => {
      await service.update("h1", dto(), "owner-1");

      expect(repo.update.mock.calls[0][2]).not.toHaveProperty("imageUrls");
    });

    it("refuses to keep an image that does not belong to the hotel", async () => {
      await expect(
        service.update("h1", dto({ imageUrls: ["https://evil.test/x.jpg"] }), "owner-1"),
      ).rejects.toBeInstanceOf(ValidationFailedException);
      expect(repo.update).not.toHaveBeenCalled();
    });
  });

  describe("addImages", () => {
    it("uploads new images and prepends them through the repository", async () => {
      await service.addImages("h1", [jpegFile()], "owner-1");

      expect(repo.addImages).toHaveBeenCalledWith("h1", ["https://img.test/new-1.jpg"]);
      expect(cloudinary.deleteImages).not.toHaveBeenCalled();
    });

    it("rejects a file that is not really an image before uploading anything", async () => {
      await expect(service.addImages("h1", [badFile()], "owner-1")).rejects.toBeInstanceOf(
        ValidationFailedException,
      );
      expect(cloudinary.uploadImages).not.toHaveBeenCalled();
    });

    it("refuses more than six images in total before uploading", async () => {
      repo.findOwnedById.mockResolvedValueOnce(
        record(Array.from({ length: 6 }, (_, i) => `https://img.test/${i}.jpg`)),
      );

      await expect(service.addImages("h1", [jpegFile()], "owner-1")).rejects.toBeInstanceOf(
        ValidationFailedException,
      );
      expect(cloudinary.uploadImages).not.toHaveBeenCalled();
    });

    it("deletes the new uploads when saving fails", async () => {
      repo.addImages.mockRejectedValueOnce(new Error("db down"));

      await expect(service.addImages("h1", [jpegFile()], "owner-1")).rejects.toThrow("db down");

      expect(cloudinary.deleteImages).toHaveBeenCalledWith(["folder/new-1"]);
    });

    it("does not upload for a hotel the user does not own", async () => {
      repo.findOwnedById.mockResolvedValueOnce(undefined);

      await expect(service.addImages("h1", [jpegFile()], "intruder")).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(cloudinary.uploadImages).not.toHaveBeenCalled();
    });
  });

  describe("removeImage", () => {
    it("refuses an image that does not belong to the hotel", async () => {
      await expect(
        service.removeImage("h1", "https://evil.test/x.jpg", "owner-1"),
      ).rejects.toBeInstanceOf(ValidationFailedException);
      expect(repo.removeImage).not.toHaveBeenCalled();
    });

    it("removes an owned image", async () => {
      await service.removeImage("h1", "https://img.test/old-1.jpg", "owner-1");

      expect(repo.removeImage).toHaveBeenCalledWith("h1", "https://img.test/old-1.jpg");
    });
  });
});
