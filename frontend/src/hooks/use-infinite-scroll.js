import { useCallback, useEffect, useRef } from 'react';

export function useInfiniteScroll({ hasMore, loading, onLoadMore, root = null }) {
  const observerRef = useRef(null);

  const sentinelRef = useCallback(
    (node) => {
      if (observerRef.current) {
        observerRef.current.disconnect();
      }
      if (!node || !hasMore) return;

      observerRef.current = new IntersectionObserver(
        (entries) => {
          const target = entries[0];
          if (target?.isIntersecting && !loading) {
            onLoadMore();
          }
        },
        {
          root: root?.current ?? null,
          rootMargin: '200px',
        }
      );
      observerRef.current.observe(node);
    },
    [hasMore, loading, onLoadMore, root]
  );

  useEffect(() => () => observerRef.current?.disconnect(), []);

  return sentinelRef;
}
