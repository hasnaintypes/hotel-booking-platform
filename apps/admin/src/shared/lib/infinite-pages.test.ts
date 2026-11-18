import type { InfiniteData } from "@tanstack/react-query";
import type { CursorPage } from "@hotel-booking/contracts";
import { describe, expect, it } from "vitest";
import { flattenPages, mapInfiniteRows, nextCursorPageParam } from "./infinite-pages";

type Row = { id: string; label: string };

const page = (ids: string[], nextCursor: string | null): CursorPage<Row> => ({
  data: ids.map((id) => ({ id, label: id.toUpperCase() })),
  pageInfo: { nextCursor, hasMore: nextCursor !== null },
});

const infinite = (pages: CursorPage<Row>[]): InfiniteData<CursorPage<Row>> => ({
  pages,
  pageParams: pages.map((_, index) => (index === 0 ? undefined : `cursor-${index}`)),
});

describe("flattenPages", () => {
  it("concatenates accumulated pages in order", () => {
    const data = infinite([page(["a", "b"], "cursor-2"), page(["c"], null)]);

    expect(flattenPages(data).map((row) => row.id)).toEqual(["a", "b", "c"]);
  });

  it("returns no rows before the first page arrives", () => {
    expect(flattenPages(undefined)).toEqual([]);
  });
});

describe("nextCursorPageParam", () => {
  it("maps the last page's null cursor to undefined", () => {
    expect(nextCursorPageParam(page([], null))).toBeUndefined();
  });

  it("passes the next cursor through", () => {
    expect(nextCursorPageParam(page(["a"], "cursor-2"))).toBe("cursor-2");
  });
});

describe("mapInfiniteRows", () => {
  it("updates matching rows without dropping paging metadata", () => {
    const data = infinite([page(["a", "b"], "cursor-2"), page(["c"], null)]);

    const updated = mapInfiniteRows(data, (row) =>
      row.id === "b" ? { ...row, label: "updated" } : row,
    );

    expect(updated?.pages[0].data.map((row) => row.label)).toEqual(["A", "updated"]);
    expect(updated?.pages[0].pageInfo).toEqual({ nextCursor: "cursor-2", hasMore: true });
    expect(updated?.pageParams).toEqual(data.pageParams);
  });

  it("leaves missing cache data alone", () => {
    expect(mapInfiniteRows<Row>(undefined, (row) => row)).toBeUndefined();
  });
});
