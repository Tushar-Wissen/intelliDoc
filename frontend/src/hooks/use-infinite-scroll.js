import { useCallback, useEffect, useRef } from 'react';

export function useInfiniteScroll({ hasMore, loading, onLoadMore }) {
  const observerRef = useRef(null);

  const sentinelRef = useCallback(
    (node) => {
      if (observerRef.current) {
        observerRef.current.disconnect();
      }
      if (!node || !hasMore) return;

      observerRef.current = new IntersectionObserver(
        (entries) => {
          if (entries[0].isIntersecting && !loading) {
            onLoadMore();
          }
        },
        { rootMargin: '200px' }
      );
      observerRef.current.observe(node);
    },
    [hasMore, loading, onLoadMore]
  );

  useEffect(() => () => observerRef.current?.disconnect(), []);

  return sentinelRef;
}
