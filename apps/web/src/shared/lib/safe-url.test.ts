import { describe, expect, it } from "vitest";
import { IMAGE_FALLBACK, safeImageSrc } from "./safe-url";

describe("safeImageSrc", () => {
  it.each([
    "https://res.cloudinary.com/demo/image/upload/a.jpg",
    "http://localhost:5001/uploads/a.png",
    "blob:http://localhost:5174/6c1a-4b2",
    "data:image/png;base64,iVBORw0KGgo=",
    "/images/hotel.svg",
  ])("allows %s", (url) => {
    expect(safeImageSrc(url)).toBe(url);
  });

  it.each([
    "javascript:alert(1)",
    "JaVaScRiPt:alert(1)",
    "data:text/html;base64,PHNjcmlwdD4=",
    "data:image/svg+xml;base64,PHN2Zz4=",
    "vbscript:msgbox(1)",
    "//evil.example/x.png",
    "",
    "   ",
  ])("replaces %j with the fallback", (url) => {
    expect(safeImageSrc(url)).toBe(IMAGE_FALLBACK);
  });

  it("handles missing values", () => {
    expect(safeImageSrc(undefined)).toBe(IMAGE_FALLBACK);
    expect(safeImageSrc(null)).toBe(IMAGE_FALLBACK);
  });
});
