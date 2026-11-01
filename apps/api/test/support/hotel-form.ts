export type FieldValue = string | string[] | undefined;

/** The fields the web form sends, as multipart text. */
export function hotelFields(
  overrides: Record<string, FieldValue> = {},
): Record<string, FieldValue> {
  return {
    name: "Harbour View",
    city: "Bristol",
    country: "United Kingdom",
    description: "A calm hotel by the water.",
    type: ["Hotel"],
    facilities: ["Free WiFi", "Pool"],
    pricePerNight: "120",
    starRating: "4",
    adultCount: "2",
    childCount: "1",
    "contact.phone": "+44 117 000 000",
    "contact.email": "info@harbour.test",
    "contact.website": "https://harbour.test",
    "policies.checkInTime": "15:00",
    "policies.checkOutTime": "11:00",
    "policies.cancellationPolicy": "Free cancellation for 24 hours",
    "policies.petPolicy": "",
    "policies.smokingPolicy": "",
    ...overrides,
  };
}

/** Adds fields the way the browser does: arrays become `key[0]`, `key[1]`, ... */
export function applyFields<T extends { field: (name: string, value: string) => unknown }>(
  request: T,
  fields: Record<string, FieldValue>,
): T {
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) value.forEach((item, i) => request.field(`${key}[${i}]`, item));
    else request.field(key, value);
  }
  return request;
}

const padded = (header: number[]) => Buffer.concat([Buffer.from(header), Buffer.alloc(32, 1)]);

/** Smallest buffers that carry each format's real file signature. */
export const jpegBytes = () => padded([0xff, 0xd8, 0xff, 0xe0]);
export const pngBytes = () => padded([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
export const webpBytes = () =>
  Buffer.concat([
    Buffer.from("RIFF"),
    Buffer.from([0x24, 0, 0, 0]),
    Buffer.from("WEBP"),
    Buffer.alloc(24, 1),
  ]);
