import { Button } from '@/components/ui/button';

export function LoadMoreButton({
  hasMore,
  isFetching,
  isError,
  onLoadMore,
}: {
  hasMore: boolean;
  isFetching: boolean;
  isError?: boolean;
  onLoadMore: () => void;
}) {
  if (!hasMore && !isError) return null;

  return (
    <div className="flex flex-col items-center gap-2 pt-2">
      {isError ? (
        <p className="text-sm text-destructive" role="alert">
          Could not load more. Try again.
        </p>
      ) : null}
      <Button variant="outline" disabled={isFetching} onClick={onLoadMore}>
        {isFetching ? 'Loading…' : isError ? 'Retry' : 'Load more'}
      </Button>
    </div>
  );
}
