import { BadGatewayException } from "@nestjs/common";
import type { ConfigService } from "@nestjs/config";
import { v2 as cloudinary } from "cloudinary";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CloudinaryService } from "./cloudinary.service";

vi.mock("cloudinary", () => ({
  v2: { config: vi.fn(), uploader: { upload: vi.fn(), destroy: vi.fn() } },
}));

const settings: Record<string, unknown> = {
  "cloudinary.cloudName": "cloud",
  "cloudinary.apiKey": "key",
  "cloudinary.apiSecret": "secret",
  "cloudinary.folder": "hotel-booking/test",
  "cloudinary.tags": ["hotel-booking", "test"],
};
const config = { get: (key: string) => settings[key] } as unknown as ConfigService;

const image = (name: string) =>
  ({ buffer: Buffer.from(name), mimetype: "image/jpeg" }) as Express.Multer.File;

const upload = vi.mocked(cloudinary.uploader.upload);
const destroy = vi.mocked(cloudinary.uploader.destroy);

const ok = (name: string) =>
  ({
    secure_url: `https://res.cloudinary.test/${name}.jpg`,
    url: `http://res.cloudinary.test/${name}.jpg`,
    public_id: `hotel-booking/test/${name}`,
  }) as never;

describe("CloudinaryService", () => {
  let service: CloudinaryService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new CloudinaryService(config);
  });

  it("configures the client for HTTPS", () => {
    expect(cloudinary.config).toHaveBeenCalledWith(expect.objectContaining({ secure: true }));
  });

  it("returns nothing, without calling Cloudinary, when there are no files", async () => {
    await expect(service.uploadImages([])).resolves.toEqual([]);
    expect(upload).not.toHaveBeenCalled();
  });

  it("stores the HTTPS url and the id, in the environment's folder with tags", async () => {
    upload.mockResolvedValueOnce(ok("a"));

    const [result] = await service.uploadImages([image("a")]);

    expect(result).toEqual({
      url: "https://res.cloudinary.test/a.jpg",
      publicId: "hotel-booking/test/a",
    });
    expect(upload).toHaveBeenCalledWith(
      expect.stringMatching(/^data:image\/jpeg;base64,/),
      expect.objectContaining({
        folder: "hotel-booking/test",
        tags: ["hotel-booking", "test"],
        resource_type: "image",
      }),
    );
  });

  it("deletes the uploads that succeeded and fails when one upload fails", async () => {
    upload.mockResolvedValueOnce(ok("a")).mockRejectedValueOnce(new Error("cloudinary down"));
    destroy.mockResolvedValue({ result: "ok" } as never);

    await expect(service.uploadImages([image("a"), image("b")])).rejects.toBeInstanceOf(
      BadGatewayException,
    );

    expect(destroy).toHaveBeenCalledTimes(1);
    expect(destroy).toHaveBeenCalledWith("hotel-booking/test/a");
  });

  it("does not leak the provider's error message", async () => {
    upload.mockRejectedValueOnce(new Error("api_key=secret rejected"));
    await expect(service.uploadImages([image("a")])).rejects.toThrow("Image upload failed");
  });

  describe("deleteImages", () => {
    it("does nothing for an empty list", async () => {
      await service.deleteImages([]);
      expect(destroy).not.toHaveBeenCalled();
    });

    it("keeps going when one deletion fails and never throws", async () => {
      destroy.mockRejectedValueOnce(new Error("nope")).mockResolvedValueOnce({} as never);

      await expect(service.deleteImages(["x", "y"])).resolves.toBeUndefined();

      expect(destroy).toHaveBeenCalledTimes(2);
    });
  });
});
