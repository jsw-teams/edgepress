import { availableParallelism, totalmem } from 'node:os';
import { readFile } from 'node:fs/promises';

const MIB = 1024 * 1024;

export function recommendConcurrency({ cpuCount = availableParallelism(), memoryBytes = totalmem() } = {}) {
  if (!Number.isFinite(cpuCount) || cpuCount < 1 || !Number.isFinite(memoryBytes) || memoryBytes < 1) {
    throw new TypeError('CPU count and memory size must be positive numbers');
  }
  // Leave headroom for Node itself and native image/Markdown dependencies.
  const memoryWorkers = Math.max(1, Math.floor(memoryBytes / (512 * MIB)));
  return Math.max(1, Math.min(8, Math.floor(cpuCount), memoryWorkers));
}

export async function recommendedConcurrency() {
  let memoryBytes = totalmem();
  for (const path of ['/sys/fs/cgroup/memory.max', '/sys/fs/cgroup/memory/memory.limit_in_bytes']) {
    try {
      const value = (await readFile(path, 'utf8')).trim();
      if (value !== 'max' && /^\d+$/.test(value)) {
        const limit = Number(value);
        if (Number.isSafeInteger(limit) && limit > 0 && limit < memoryBytes) memoryBytes = limit;
      }
    } catch (error) {
      if (error.code !== 'ENOENT' && error.code !== 'EACCES') throw error;
    }
  }
  return recommendConcurrency({ memoryBytes });
}

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
