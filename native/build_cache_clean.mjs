#!/usr/bin/env node
// build_cache_clean.mjs - manual inspection/cleanup for native/build_cache.mjs's on-disk cache.
// No automatic eviction exists (see build_cache.mjs's header) - this is the documented manual
// follow-up: report current size, or wipe the cache entirely.
//
//   node native/build_cache_clean.mjs           # report entry count + size
//   node native/build_cache_clean.mjs --clear   # delete every cached binary
import { cacheStats, clearCache, CACHE_DIR_PATH } from './build_cache.mjs';

function humanBytes(n) {
  if (n < 1024) return `${n}B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)}KB`;
  return `${(n / (1024 * 1024)).toFixed(1)}MB`;
}

const clear = process.argv.includes('--clear');

if (clear) {
  const before = cacheStats();
  clearCache();
  console.log(`cleared ${before.entries} entr${before.entries === 1 ? 'y' : 'ies'} (${humanBytes(before.bytes)}) from ${CACHE_DIR_PATH}`);
} else {
  const stats = cacheStats();
  console.log(`native build cache: ${stats.dir}`);
  console.log(`  entries: ${stats.entries}`);
  console.log(`  size:    ${humanBytes(stats.bytes)}`);
  if (stats.entries > 0) console.log('\nrun with --clear to delete all entries.');
}
