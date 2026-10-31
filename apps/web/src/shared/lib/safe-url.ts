/** Shown when an image URL is missing or not an allowed kind of URL. */
export const IMAGE_FALLBACK = "/hotel-1.svg";

const INLINE_RASTER = /^data:image\/(?:png|jpe?g|gif|webp|avif);base64,/i;

// Allowed: http(s) URLs, blob URLs from local previews, inline raster images and
// same-origin paths. Everything else (javascript:, data:text/html, vbscript:, ...) is refused.
export function safeImageSrc(url: string | null | undefined): string {
  const candidate = typeof url === "string" ? url.trim() : "";
  const lower = candidate.toLowerCase();
  if (lower.startsWith("https://") || lower.startsWith("http://") || lower.startsWith("blob:")) {
    return candidate;
  }
  if (INLINE_RASTER.test(candidate)) {
    return candidate;
  }
  if (candidate.startsWith("/") && !candidate.startsWith("//")) {
    return candidate;
  }
  return IMAGE_FALLBACK;
}
