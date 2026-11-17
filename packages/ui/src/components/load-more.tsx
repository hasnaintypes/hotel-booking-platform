import { Button } from "./button";

export type LoadMoreProps = {
  /** True when the API reported another page; the control renders nothing otherwise. */
  hasMore: boolean;
  isFetching: boolean;
  onClick: () => void;
  label?: string;
  loadingLabel?: string;
};

/**
 * Server-side "next page" control for cursor lists. The table/card body keeps the accumulated
 * rows; this only asks the owning list for one more page.
 */
export function LoadMore({
  hasMore,
  isFetching,
  onClick,
  label = "Load more",
  loadingLabel = "Loading…",
}: LoadMoreProps) {
  if (!hasMore) return null;

  return (
    <div className="flex justify-center pt-2">
      <Button type="button" variant="outline" size="sm" onClick={onClick} disabled={isFetching}>
        {isFetching ? loadingLabel : label}
      </Button>
    </div>
  );
}
