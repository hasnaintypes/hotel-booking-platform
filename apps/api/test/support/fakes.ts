import { vi } from "vitest";

export function createFakeCloudinary() {
  return {
    uploadImages: vi.fn(async (files: unknown[]) =>
      (files ?? []).map((_, i) => ({
        url: `https://res.cloudinary.test/image-${i}.jpg`,
        publicId: `hotel-booking/test/image-${i}`,
      })),
    ),
    deleteImages: vi.fn(async (_publicIds: string[]) => {}),
  };
}
