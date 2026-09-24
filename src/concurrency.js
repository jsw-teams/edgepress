export async function mapLimit(items, limit, fn) {
  if (!Number.isInteger(limit) || limit < 1) throw new TypeError('Concurrency limit must be a positive integer');
  const results = new Array(items.length);
  let next = 0;
  let failure;
  let hasFailure = false;

  async function worker() {
    while (!hasFailure) {
      const index = next++;
      if (index >= items.length) return;
      try { results[index] = await fn(items[index], index); }
      catch (error) {
        if (!hasFailure) {
          failure = error instanceof Error ? error : new Error(String(error));
          hasFailure = true;
        }
        return;
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
  if (hasFailure) throw failure;
  return results;
}
