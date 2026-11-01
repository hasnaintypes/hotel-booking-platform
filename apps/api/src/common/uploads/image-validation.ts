import type { Request } from "express";
import type { FileFilterCallback } from "multer";
import { ValidationFailedException } from "../errors/validation-failed.exception";

export const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export type AllowedImageType = (typeof ALLOWED_IMAGE_TYPES)[number];

export const IMAGE_FIELD = "imageFiles";
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
/** Most images one hotel may have in total, counting the ones it already has. */
export const HOTEL_MAX_IMAGES = 6;

const TYPE_MESSAGE = "only JPEG, PNG and WebP images are allowed";

const startsWith = (buffer: Uint8Array, bytes: number[], offset = 0) =>
  bytes.every((byte, i) => buffer[offset + i] === byte);

/** Identifies an image by its file signature, ignoring whatever the client claimed. */
export function detectImageType(buffer: Uint8Array | undefined): AllowedImageType | undefined {
  if (!buffer || buffer.length < 12) return undefined;
  if (startsWith(buffer, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (startsWith(buffer, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  // WebP is a RIFF container: "RIFF", a 4-byte size, then "WEBP".
  if (
    startsWith(buffer, [0x52, 0x49, 0x46, 0x46]) &&
    startsWith(buffer, [0x57, 0x45, 0x42, 0x50], 8)
  ) {
    return "image/webp";
  }
  return undefined;
}

/** Multer filter: refuses a file whose declared type is not an allowed image type. */
export function imageFileFilter(
  _request: Request,
  file: Express.Multer.File,
  callback: FileFilterCallback,
): void {
  if ((ALLOWED_IMAGE_TYPES as readonly string[]).includes(file.mimetype)) {
    callback(null, true);
    return;
  }
  callback(new ValidationFailedException([{ field: IMAGE_FIELD, message: TYPE_MESSAGE }]));
}

/**
 * Checks the uploaded bytes themselves: each file must really be a JPEG, PNG or WebP and match the
 * type it was declared as. Call before anything is uploaded.
 */
export function assertValidImages(files: Express.Multer.File[] | undefined): void {
  const errors = (files ?? []).flatMap((file, index) => {
    const detected = detectImageType(file.buffer);
    return detected && detected === file.mimetype
      ? []
      : [{ field: IMAGE_FIELD, message: `file ${index + 1}: ${TYPE_MESSAGE}` }];
  });

  if (errors.length > 0) {
    throw new ValidationFailedException(errors);
  }
}
