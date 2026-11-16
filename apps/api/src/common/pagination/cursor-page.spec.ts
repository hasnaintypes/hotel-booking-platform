import { describe, expect, it } from "vitest";
import { decodeCursor } from "./cursor";
import { anchorOf, pageOf } from "./cursor-page";

type Row = { id: string; cursorKey: string; name: string };

const row = (id: string, cursorKey: string): Row => ({ id, cursorKey, name: `row-${id}` });

const position = (value: Row) => anchorOf(value);

describe("pageOf", () => {
  it("returns an empty first page without a cursor when there are no rows", () => {
    expect(pageOf<Row>([], 20, "scope", position)).toEqual({
      data: [],
      pageInfo: { hasMore: false, nextCursor: null },
    });
  });

  it("returns the last page untouched with no next cursor", () => {
    const rows = [row("a", "2026-11-16T10:00:00.000001Z")];

    expect(pageOf(rows, 20, "scope", position)).toEqual({
      data: rows,
      pageInfo: { hasMore: false, nextCursor: null },
    });
  });

  it("trims the probe row and anchors the cursor on the last returned row", () => {
    const first = row("a", "2026-11-16T10:00:00.000001Z");
    const second = row("b", "2026-11-16T10:00:00.000002Z");
    const probe = row("c", "2026-11-16T10:00:00.000003Z");

    const page = pageOf([first, second, probe], 2, "scope", position);

    expect(page.data).toEqual([first, second]);
    expect(page.pageInfo.hasMore).toBe(true);
    expect(decodeCursor(page.pageInfo.nextCursor as string)).toEqual({
      key: `scope|${second.cursorKey}`,
      id: second.id,
    });
  });
});
