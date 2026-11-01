import { describe, expect, it, vi } from "vitest";
import { ValidationFailedException } from "../errors/validation-failed.exception";
import { assertValidImages, detectImageType, imageFileFilter } from "./image-validation";

const padded = (header: number[]) => Buffer.concat([Buffer.from(header), Buffer.alloc(32, 1)]);
const jpeg = () => padded([0xff, 0xd8, 0xff, 0xe0]);
const png = () => padded([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const webp = () =>
  Buffer.concat([Buffer.from("RIFF"), Buffer.alloc(4), Buffer.from("WEBP"), Buffer.alloc(24, 1)]);

const file = (buffer: Buffer, mimetype: string) => ({ buffer, mimetype }) as Express.Multer.File;

describe("detectImageType", () => {
  it("recognises JPEG, PNG and WebP by their signatures", () => {
    expect(detectImageType(jpeg())).toBe("image/jpeg");
    expect(detectImageType(png())).toBe("image/png");
    expect(detectImageType(webp())).toBe("image/webp");
  });

  it.each([
    ["HTML", Buffer.from("<html><script>alert(1)</script></html>")],
    ["an SVG", Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>')],
    ["a GIF", Buffer.from("GIF89a" + "x".repeat(30))],
    [
      "a RIFF file that is not WebP",
      Buffer.concat([Buffer.from("RIFF"), Buffer.alloc(4), Buffer.from("WAVE"), Buffer.alloc(24)]),
    ],
    ["a truncated file", Buffer.from([0xff, 0xd8, 0xff])],
    ["an empty file", Buffer.alloc(0)],
  ])("does not accept %s", (_name, buffer) => {
    expect(detectImageType(buffer)).toBeUndefined();
  });

  it("handles a missing buffer", () => {
    expect(detectImageType(undefined)).toBeUndefined();
  });
});

describe("assertValidImages", () => {
  it("accepts files whose bytes match their declared type", () => {
    expect(() =>
      assertValidImages([
        file(jpeg(), "image/jpeg"),
        file(png(), "image/png"),
        file(webp(), "image/webp"),
      ]),
    ).not.toThrow();
  });

  it("accepts no files", () => {
    expect(() => assertValidImages([])).not.toThrow();
    expect(() => assertValidImages(undefined)).not.toThrow();
  });

  it("rejects a file whose bytes are not an image although it claims to be one", () => {
    expect(() =>
      assertValidImages([file(Buffer.from("<html></html>" + " ".repeat(30)), "image/png")]),
    ).toThrow(ValidationFailedException);
  });

  it("rejects a file whose real type differs from the declared one", () => {
    expect(() => assertValidImages([file(png(), "image/jpeg")])).toThrow(ValidationFailedException);
  });

  it("names the offending file without echoing its name", () => {
    try {
      assertValidImages([file(jpeg(), "image/jpeg"), file(Buffer.alloc(40), "image/png")]);
      expect.unreachable();
    } catch (error) {
      expect((error as ValidationFailedException).fieldErrors).toEqual([
        { field: "imageFiles", message: "file 2: only JPEG, PNG and WebP images are allowed" },
      ]);
    }
  });
});

describe("imageFileFilter", () => {
  const run = (mimetype: string) => {
    const callback = vi.fn();
    imageFileFilter(
      {} as never,
      { mimetype, fieldname: "imageFiles" } as Express.Multer.File,
      callback,
    );
    return callback;
  };

  it.each(["image/jpeg", "image/png", "image/webp"])("accepts %s", (type) => {
    expect(run(type)).toHaveBeenCalledWith(null, true);
  });

  it.each(["image/svg+xml", "image/gif", "text/html", "application/pdf", ""])(
    "refuses %j",
    (type) => {
      const callback = run(type);
      expect(callback.mock.calls[0][0]).toBeInstanceOf(ValidationFailedException);
    },
  );
});
