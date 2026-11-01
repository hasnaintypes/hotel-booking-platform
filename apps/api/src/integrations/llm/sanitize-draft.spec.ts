import { describe, expect, it } from "vitest";
import { MAX_DRAFT_CHARS, sanitizeDraft } from "./sanitize-draft";

// Built from code points so this file contains no invisible characters.
const ch = (...codes: number[]) => String.fromCharCode(...codes);
const NUL = ch(0x00);
const BEL = ch(0x07);
const ESC = ch(0x1b);
const DEL = ch(0x7f);
const NEL = ch(0x85);
const ZERO_WIDTH_SPACE = ch(0x200b);
const RIGHT_TO_LEFT_OVERRIDE = ch(0x202e);
const POP_DIRECTIONAL = ch(0x202c);
const ISOLATE_START = ch(0x2066);
const ISOLATE_END = ch(0x2069);
const BYTE_ORDER_MARK = ch(0xfeff);
const LINE_SEPARATOR = ch(0x2028);

describe("sanitizeDraft", () => {
  it("leaves ordinary text, newlines and tabs alone", () => {
    expect(sanitizeDraft("A calm hotel.\nWith a pool.\tAnd a bar.")).toBe(
      "A calm hotel.\nWith a pool.\tAnd a bar.",
    );
  });

  it("keeps accented and non-Latin text and emoji", () => {
    expect(sanitizeDraft("Café Müller — 東京 🌴")).toBe("Café Müller — 東京 🌴");
  });

  it("removes control characters", () => {
    expect(sanitizeDraft(`a${NUL}b${BEL}c${ESC}d${DEL}e${NEL}f`)).toBe("abcdef");
  });

  it("removes zero-width and direction-changing characters", () => {
    const text =
      `pay${ZERO_WIDTH_SPACE}ment ${RIGHT_TO_LEFT_OVERRIDE}gnp.exe${POP_DIRECTIONAL} ` +
      `${ISOLATE_START}x${ISOLATE_END}${BYTE_ORDER_MARK}`;
    expect(sanitizeDraft(text)).toBe("payment gnp.exe x");
  });

  it("removes line and paragraph separators", () => {
    expect(sanitizeDraft(`one${LINE_SEPARATOR}two`)).toBe("onetwo");
  });

  it("normalises line endings and collapses long runs of blank lines", () => {
    expect(sanitizeDraft("one\r\ntwo\rthree\n\n\n\n\nfour")).toBe("one\ntwo\nthree\n\nfour");
  });

  it("trims surrounding whitespace", () => {
    expect(sanitizeDraft("  \n hello \n  ")).toBe("hello");
  });

  it("returns markup unchanged as text (it is never rendered as HTML)", () => {
    expect(sanitizeDraft("<script>alert(1)</script>")).toBe("<script>alert(1)</script>");
  });

  it("caps the length and marks the cut", () => {
    const out = sanitizeDraft("x".repeat(MAX_DRAFT_CHARS + 500));
    expect(out).toHaveLength(MAX_DRAFT_CHARS);
    expect(out.endsWith("…")).toBe(true);
  });

  it("does not split an emoji when cutting", () => {
    const out = sanitizeDraft("x".repeat(MAX_DRAFT_CHARS - 2) + "🌴🌴🌴");
    expect(out).not.toMatch(/[\uD800-\uDBFF]…$/);
    expect(out.endsWith("…")).toBe(true);
  });

  it("copes with empty or missing input", () => {
    expect(sanitizeDraft("")).toBe("");
    expect(sanitizeDraft(undefined as unknown as string)).toBe("");
  });
});
