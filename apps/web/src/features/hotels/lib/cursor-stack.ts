/**
 * History for a cursor-paginated list.
 *
 * The API only hands out a cursor for the *next* page, so "Previous" works by remembering the
 * cursors already visited. Cursors are scoped to one list and sort, which is why every filter
 * change resets the whole stack instead of trying to reuse an entry.
 */
export type CursorStack = {
  /** Cursor for the page currently displayed, or undefined for the first page. */
  cursor: string | undefined;
  /** Cursors for the pages before `cursor`, most recent last. */
  history: Array<string | undefined>;
};

export const emptyCursorStack = (): CursorStack => ({ cursor: undefined, history: [] });

/** Moves forward: remember the current cursor so "Previous" can come back to it. */
export const pushCursor = (stack: CursorStack, nextCursor: string): CursorStack => ({
  cursor: nextCursor,
  history: [...stack.history, stack.cursor],
});

/** Moves back one page; a first page has nothing to pop and is returned unchanged. */
export const popCursor = (stack: CursorStack): CursorStack => {
  if (stack.history.length === 0) return stack;
  return {
    cursor: stack.history[stack.history.length - 1],
    history: stack.history.slice(0, -1),
  };
};
