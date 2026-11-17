import { describe, expect, it } from "vitest";
import { emptyCursorStack, popCursor, pushCursor } from "./cursor-stack";

describe("cursor stack", () => {
  it("starts on the first page with nothing to go back to", () => {
    const stack = emptyCursorStack();

    expect(stack).toEqual({ cursor: undefined, history: [] });
    expect(popCursor(stack)).toBe(stack);
  });

  it("remembers the current cursor when moving forward", () => {
    const second = pushCursor(emptyCursorStack(), "cursor-2");

    expect(second).toEqual({ cursor: "cursor-2", history: [undefined] });
  });

  it("walks forward and back again", () => {
    const first = emptyCursorStack();
    const second = pushCursor(first, "cursor-2");
    const third = pushCursor(second, "cursor-3");

    expect(popCursor(third)).toEqual(second);
    expect(popCursor(popCursor(third))).toEqual(first);
  });

  it("pops back to the remembered cursor rather than recomputing one", () => {
    const third = pushCursor(pushCursor(emptyCursorStack(), "cursor-2"), "cursor-3");

    expect(popCursor(third).cursor).toBe("cursor-2");
  });
});
