/** Shown when an image URL is missing or not an allowed kind of URL. */
export const IMAGE_FALLBACK = "/hotel-1.svg";

// Allowed: http(s) URLs, blob URLs from local previews, inline raster images and
// same-origin paths. Everything else (javascript:, data:text/html, vbscript:, ...) is refused.
const SAFE_IMAGE_SRC =
  /^(?:https?:\/\/|blob:|data:image\/(?:png|jpe?g|gif|webp|avif);base64,|\/(?!\/))/i;

export function safeImageSrc(url: string | null | undefined): string {
  const candidate = typeof url === "string" ? url.trim() : "";
  return SAFE_IMAGE_SRC.test(candidate) ? candidate : IMAGE_FALLBACK;
}
