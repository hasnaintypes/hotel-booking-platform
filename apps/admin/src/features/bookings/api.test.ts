import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchBookings } from "./api";

const apiClient = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
}));

vi.mock("@hotel-booking/api-client", () => ({
  default: apiClient,
  clearIdempotencyKey: vi.fn(),
  getErrorStatus: vi.fn(),
  idempotencyHeaders: vi.fn(() => ({})),
}));

describe("fetchBookings", () => {
  beforeEach(() => {
    apiClient.get.mockReset().mockResolvedValue({
      data: { data: [], pageInfo: { nextCursor: null, hasMore: false } },
    });
  });

  it("sends the filters and cursor it was given and drops empty values", async () => {
    const page = await fetchBookings({ status: "confirmed", cursor: "abc", q: "" });

    expect(apiClient.get).toHaveBeenCalledWith("/api/v1/admin/bookings", {
      params: { status: "confirmed", cursor: "abc" },
    });
    expect(page.pageInfo).toEqual({ nextCursor: null, hasMore: false });
  });

  it("never sends an offset", async () => {
    await fetchBookings({ status: "confirmed" });

    const [, options] = apiClient.get.mock.calls[0];
    expect(options.params).not.toHaveProperty("offset");
  });
});
