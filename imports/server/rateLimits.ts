// A token bucket: up to its burst in tokens, refilled at its rate (tokens a
// second), one taken per call it lets through.
export interface Bucket {
  tokens: number;
  refilledAt: number;
}

export function refill(
  bucket: Bucket,
  now: number,
  burst: number,
  rate: number,
) {
  bucket.tokens = Math.min(
    burst,
    bucket.tokens + ((now - bucket.refilledAt) / 1000) * rate,
  );
  bucket.refilledAt = now;
}

// Refills the bucket, then takes a token from it if it has one. Returns
// whether it did.
export function take(bucket: Bucket, now: number, burst: number, rate: number) {
  refill(bucket, now, burst, rate);
  if (bucket.tokens < 1) return false;
  bucket.tokens -= 1;
  return true;
}

// Sets key in a map that holds at most max entries, dropping those set
// longest ago once it's past that.
export function remember<V>(
  map: Map<string, V>,
  key: string,
  value: V,
  max: number,
) {
  map.delete(key);
  map.set(key, value);
  for (const oldest of map.keys()) {
    if (map.size <= max) break;
    map.delete(oldest);
  }
}
