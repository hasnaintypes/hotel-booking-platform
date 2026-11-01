export const MAX_DRAFT_CHARS = 4000;

// Code point ranges to remove, as numbers so the source never contains an invisible character:
// control characters other than tab (0x09) and newline (0x0A), the C1 range, zero-width and
// direction-changing formatting characters, line and paragraph separators, and the byte order mark.
const UNSAFE_RANGES: Array<[number, number]> = [
  [0x00, 0x08],
  [0x0b, 0x1f],
  [0x7f, 0x9f],
  [0x200b, 0x200f],
  [0x2028, 0x2029],
  [0x202a, 0x202e],
  [0x2060, 0x2064],
  [0x2066, 0x2069],
  [0xfeff, 0xfeff],
];

const isUnsafe = (codePoint: number) =>
  UNSAFE_RANGES.some(([low, high]) => codePoint >= low && codePoint <= high);

/**
 * Model output is untrusted text. It is returned as a JSON string for a person to review, never
 * rendered as HTML and never saved automatically; this strips characters that have no place in a
 * hotel description and caps the length.
 */
export function sanitizeDraft(text: string): string {
  const normalised = String(text ?? "").replace(/\r\n?/g, "\n");

  const cleaned = Array.from(normalised)
    .filter((character) => !isUnsafe(character.codePointAt(0) ?? 0))
    .join("")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  if (cleaned.length <= MAX_DRAFT_CHARS) return cleaned;
  // Do not cut a surrogate pair in half.
  return cleaned.slice(0, MAX_DRAFT_CHARS - 1).replace(/[\uD800-\uDBFF]$/, "") + "…";
}
