// Minimal fixed-window rate limiter kept in memory. Enough to blunt abuse of a
// public, account-less service (spammed game creation, player floods, score
// storms) without pulling in an external dependency or a shared store.
//
// `hits(key)` records one event for `key` and returns true if the caller is now
// over `limit` within the rolling `windowMs`. Stale buckets are swept lazily so
// the map can't grow without bound.
export function createRateLimiter({ windowMs, limit }) {
  const buckets = new Map();

  function sweep(now) {
    for (const [key, bucket] of buckets) {
      if (now - bucket.start >= windowMs) buckets.delete(key);
    }
  }

  let lastSweep = Date.now();

  return function hits(key) {
    const now = Date.now();
    if (now - lastSweep >= windowMs) {
      sweep(now);
      lastSweep = now;
    }
    let bucket = buckets.get(key);
    if (!bucket || now - bucket.start >= windowMs) {
      bucket = { start: now, count: 0 };
      buckets.set(key, bucket);
    }
    bucket.count += 1;
    return bucket.count > limit;
  };
}
