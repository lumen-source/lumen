// build_cache_test.mjs - correctness + real-speedup proof for build_cache.mjs and its wiring into
// pipeline.mjs's buildAndRunFnResident.
//
// Correctness is the whole point of this file (see build_cache.mjs's header): a cache that ever
// serves the WRONG binary for a given source is worse than no cache. Every test below either
// proves a hit/miss produces output identical to the uncached reference path (buildAndRunFn,
// completely untouched by this change), or deliberately tries to trick the cache into a false
// hit and asserts it refuses.
//
// Runs entirely against an isolated scratch cache directory (LUMEN_BUILD_CACHE_DIR), never the
// real repo-local native/.native-build-cache/, so this test can never pollute or be polluted by
// a developer's real cache.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCRATCH_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'lumen-build-cache-test-'));
// The cache dir itself and the scratch area unit tests stage fake binaries in must be SIBLINGS,
// not the same directory: clearCache() below does an rmSync(CACHE_DIR_PATH, recursive:true) -
// pointing the cache dir at the same directory the fixture staging uses would delete the fixture
// area out from under a test the moment it calls clearCache().
const SCRATCH = path.join(SCRATCH_ROOT, 'cache');
const FIXTURES = path.join(SCRATCH_ROOT, 'fixtures');
fs.mkdirSync(FIXTURES, { recursive: true });
process.env.LUMEN_BUILD_CACHE_DIR = SCRATCH;

const { buildCacheKey, getCachedBinary, storeBinary, cacheStats, clearCache, CACHE_DIR_PATH } = await import('./build_cache.mjs');
const { buildAndRunFn, buildAndRunFnResident } = await import('./pipeline.mjs');
const { stopResidentCompiler } = await import('./native_compile.mjs');
const { reapStaleResidents } = await import('./reap_residents.mjs');

assert.equal(CACHE_DIR_PATH, SCRATCH, 'build_cache.mjs must honor LUMEN_BUILD_CACHE_DIR for this test to be isolated');

// Safety net: reap any `--resident` processes orphaned by a previous interrupted run before
// spawning our own (native_pipeline_test.mjs does the same - see reap_residents.mjs's header).
reapStaleResidents();

let failures = 0, passes = 0;
function check(name, fn) {
  try { fn(); console.log(`ok - ${name}`); passes++; }
  catch (e) { failures++; console.error(`FAIL - ${name}\n  ${e.stack || e.message}`); }
}
async function checkAsync(name, fn) {
  try { await fn(); console.log(`ok - ${name}`); passes++; }
  catch (e) { failures++; console.error(`FAIL - ${name}\n  ${e.stack || e.message}`); }
}

function readSrc(rel) { return fs.readFileSync(path.join(__dirname, rel), 'utf8'); }
const FIB = readSrc('../mu/examples/fib_print.lm');
const GCD = readSrc('../mu/examples/gcd.lm');

// A trivial "binary" fixture for the unit-level store/get tests below: build_cache.mjs only
// copies bytes and checks X_OK, so any executable file stands in for a real clang output without
// paying a clang invocation per unit test.
function makeFakeBinary(dir, stdoutText) {
  const p = path.join(dir, 'fake-bin');
  fs.writeFileSync(p, `#!/bin/sh\nprintf '%s' '${stdoutText}'\n`);
  fs.chmodSync(p, 0o755);
  return p;
}

// ===================== unit tests: build_cache.mjs in isolation =====================

check('miss on an empty cache', () => {
  clearCache();
  assert.equal(getCachedBinary('int main(){return 0;}', '-O2'), null);
});

check('store then get: same (csrc, opt) is a hit, execFileSync-able, correct stdout', () => {
  clearCache();
  const csrc = 'int main(){return 0;} /* unit test A */';
  const dir = fs.mkdtempSync(path.join(FIXTURES, '.build-'));
  const fake = makeFakeBinary(dir, 'hello-from-cache');
  storeBinary(csrc, '-O2', fake);
  const hit = getCachedBinary(csrc, '-O2');
  assert.notEqual(hit, null, 'must be a hit right after storing');
  const out = execFileSync(hit, { encoding: 'utf8' });
  assert.equal(out, 'hello-from-cache');
});

check('a one-byte csrc change misses (distinct key, no false hit)', () => {
  clearCache();
  const a = 'int main(){return 0;} /* A */';
  const b = 'int main(){return 0;} /* B */';
  const dir = fs.mkdtempSync(path.join(FIXTURES, '.build-'));
  storeBinary(a, '-O2', makeFakeBinary(dir, 'A'));
  assert.equal(getCachedBinary(b, '-O2'), null, 'different csrc must not hit A\'s entry');
  assert.notEqual(buildCacheKey(a, '-O2'), buildCacheKey(b, '-O2'));
});

check('a different opt level misses even for identical csrc (opt is part of the key)', () => {
  clearCache();
  const csrc = 'int main(){return 0;} /* opt-level test */';
  const dir = fs.mkdtempSync(path.join(FIXTURES, '.build-'));
  storeBinary(csrc, '-O2', makeFakeBinary(dir, 'O2'));
  assert.equal(getCachedBinary(csrc, '-O0'), null, '-O0 request must not reuse an -O2 entry');
  assert.notEqual(buildCacheKey(csrc, '-O2'), buildCacheKey(csrc, '-O0'));
});

check('PARANOIA: a corrupted src.c sidecar (simulated key-construction bug) is refused, not trusted', () => {
  // This is the second, independent defense from build_cache.mjs's header: even if two different
  // csrc strings somehow computed the SAME key (a hash collision, or a bug that dropped an input
  // from buildCacheKey), the stored source is re-read and compared byte-for-byte on every hit.
  // Simulate that failure mode directly by writing a well-formed entry, then tampering with its
  // src.c out from under the cache, and confirm getCachedBinary refuses to serve the now-stale
  // binary rather than trusting the (still-valid-looking) directory structure.
  clearCache();
  const csrc = 'int main(){return 42;} /* original */';
  const dir = fs.mkdtempSync(path.join(FIXTURES, '.build-'));
  storeBinary(csrc, '-O2', makeFakeBinary(dir, 'original-binary'));
  const key = buildCacheKey(csrc, '-O2');
  const entryDir = path.join(SCRATCH, key);
  assert.ok(fs.existsSync(path.join(entryDir, 'bin')), 'entry must exist before tampering');
  fs.writeFileSync(path.join(entryDir, 'src.c'), 'int main(){return 42;} /* TAMPERED */');
  const hit = getCachedBinary(csrc, '-O2');
  assert.equal(hit, null, 'a tampered/mismatched src.c sidecar must never be trusted as a hit');
});

check('concurrent-writer race: storing the same key twice keeps a valid, hit-able entry', () => {
  clearCache();
  const csrc = 'int main(){return 0;} /* race */';
  const dir = fs.mkdtempSync(path.join(FIXTURES, '.build-'));
  storeBinary(csrc, '-O2', makeFakeBinary(dir, 'first'));
  storeBinary(csrc, '-O2', makeFakeBinary(dir, 'first'));   // second writer, same key - must not corrupt the entry
  assert.notEqual(getCachedBinary(csrc, '-O2'), null);
});

check('LUMEN_NO_CACHE=1 bypasses reads and writes entirely', () => {
  clearCache();
  process.env.LUMEN_NO_CACHE = '1';
  try {
    const csrc = 'int main(){return 0;} /* bypass */';
    const dir = fs.mkdtempSync(path.join(FIXTURES, '.build-'));
    storeBinary(csrc, '-O2', makeFakeBinary(dir, 'x'));
    assert.equal(getCachedBinary(csrc, '-O2'), null, 'no read while bypassed');
    assert.equal(fs.existsSync(path.join(SCRATCH, buildCacheKey(csrc, '-O2'))), false, 'no write while bypassed');
  } finally {
    delete process.env.LUMEN_NO_CACHE;
  }
});

check('cacheStats reports entry count and size; clearCache empties it', () => {
  clearCache();
  const dir = fs.mkdtempSync(path.join(FIXTURES, '.build-'));
  storeBinary('int main(){return 0;} /* stats-1 */', '-O2', makeFakeBinary(dir, 'one'));
  storeBinary('int main(){return 0;} /* stats-2 */', '-O2', makeFakeBinary(dir, 'two'));
  const stats = cacheStats();
  assert.equal(stats.entries, 2);
  assert.ok(stats.bytes > 0);
  clearCache();
  assert.equal(cacheStats().entries, 0);
});

// ===================== integration: buildAndRunFnResident end to end =====================
// The real correctness bar from the task: a cache hit and a cache miss must both produce output
// BYTE-IDENTICAL to the uncached reference path (buildAndRunFn, which this change never touches).

await checkAsync('miss then hit on the SAME Lumen source produce identical output to each other and to buildAndRunFn (uncached reference)', async () => {
  clearCache();
  const reference = await buildAndRunFn(FIB, '-O2');
  assert.equal(reference.stdout, '55\n');
  assert.equal(reference.exit, 0);

  const first = await buildAndRunFnResident(FIB, '-O2');
  assert.equal(first.cacheHit, false, 'first resident call on a fresh cache must be a miss');
  assert.equal(first.stdout, reference.stdout);
  assert.equal(first.exit, reference.exit);
  assert.equal(first.csrc, reference.csrc, 'emitted C must be identical between the resident and non-resident paths');

  const second = await buildAndRunFnResident(FIB, '-O2');
  assert.equal(second.cacheHit, true, 'second resident call on the SAME source must be a hit');
  assert.equal(second.stdout, reference.stdout, 'a cache HIT must produce output identical to the uncached reference');
  assert.equal(second.exit, reference.exit);
});

await checkAsync('two DIFFERENT Lumen sources never false-hit each other', async () => {
  clearCache();
  const fibRun = await buildAndRunFnResident(FIB, '-O2');
  const gcdRun = await buildAndRunFnResident(GCD, '-O2');
  assert.equal(fibRun.cacheHit, false);
  assert.equal(gcdRun.cacheHit, false, 'a distinct program must never hit a previous, different program\'s cache entry');
  assert.equal(fibRun.stdout, '55\n');
  assert.equal(gcdRun.stdout, '12\n');

  const gcdReference = await buildAndRunFn(GCD, '-O2');
  assert.equal(gcdRun.stdout, gcdReference.stdout);
  assert.equal(gcdRun.exit, gcdReference.exit);
});

console.log(`\nSummary: ${passes} pass, ${failures} fail`);

// ===================== real speedup proof (wall-clock, no correctness assertions) =====================
// Same discipline as native_pipeline_test.mjs's own timing section: reported, never gated (local
// machine variance is real), and skipped in CI for the same reason that file skips its timing
// section there. N repeated calls on the SAME source should show calls 2..N far faster than call
// 1 (clang skipped entirely on every hit); N calls each on a DIFFERENT source should show no such
// speedup (every call is a genuine miss, same cost as the uncached path modulo resident-compile).
if (!process.env.CI) {
  console.log('\n== Real speedup: N repeats of the SAME source vs N DIFFERENT sources ==');
  const CORPUS = [
    '../mu/examples/fib_print.lm', '../mu/examples/add.lm', '../mu/examples/max.lm',
    '../mu/examples/fact.lm', '../mu/examples/locals.lm', '../mu/examples/forward.lm',
    '../mu/examples/mutual.lm', '../mu/examples/hello.lm', '../mu/examples/greet.lm',
    '../mu/examples/compare.lm',
  ].map(readSrc);
  const N = CORPUS.length;

  clearCache();
  const sameSrc = CORPUS[0];
  const sameTimes = [];
  for (let i = 0; i < N; i++) {
    const t0 = process.hrtime.bigint();
    const r = await buildAndRunFnResident(sameSrc, '-O2');
    sameTimes.push(Number(process.hrtime.bigint() - t0) / 1e6);
    if (i > 0 && !r.cacheHit) console.log(`  (warning: call ${i + 1} on identical source was not a cache hit)`);
  }

  clearCache();
  const diffTimes = [];
  for (let i = 0; i < N; i++) {
    const t0 = process.hrtime.bigint();
    await buildAndRunFnResident(CORPUS[i], '-O2');
    diffTimes.push(Number(process.hrtime.bigint() - t0) / 1e6);
  }

  const fmt = (arr) => arr.map((t) => t.toFixed(1)).join('ms, ') + 'ms';
  console.log(`same-source ${N} calls (call 1 = miss, 2..${N} = hit): ${fmt(sameTimes)}`);
  console.log(`different-source ${N} calls (every call = miss):        ${fmt(diffTimes)}`);

  const sameFirst = sameTimes[0];
  const sameRestAvg = sameTimes.slice(1).reduce((a, b) => a + b, 0) / (sameTimes.length - 1);
  const diffAvg = diffTimes.reduce((a, b) => a + b, 0) / diffTimes.length;
  console.log(`\nsame-source: call 1 (miss) ${sameFirst.toFixed(1)}ms, calls 2..${N} avg (hit) ${sameRestAvg.toFixed(1)}ms`);
  console.log(`  -> cache hit speedup vs that same program's own miss: ${(sameFirst / sameRestAvg).toFixed(1)}x`);
  console.log(`different-source: avg (every call a miss) ${diffAvg.toFixed(1)}ms`);
  console.log(`  -> hit (${sameRestAvg.toFixed(1)}ms) vs a genuine cross-program miss (${diffAvg.toFixed(1)}ms): ${(diffAvg / sameRestAvg).toFixed(1)}x faster on a hit, as expected (no false speedup on distinct sources)`);
} else {
  console.log('\n(real speedup section skipped in CI - wall-clock timing is local-only, same policy as native_pipeline_test.mjs)');
}

clearCache();
fs.rmSync(SCRATCH_ROOT, { recursive: true, force: true });

// Stop the shared resident compiler this test's buildAndRunFnResident calls spawned - compileToIRAuto
// spawns it lazily as a process-wide singleton (native_compile.mjs's getResidentCompiler()) that
// otherwise stays alive indefinitely (by design, for a long-running caller like the MCP server),
// which both leaves an orphaned `--resident` process behind and keeps THIS script's own event
// loop alive past its last assertion. Explicit process.exit() below is the final belt-and-suspenders
// guarantee regardless (same pattern as native_pipeline_test.mjs's unconditional exit at the end).
stopResidentCompiler();

if (failures > 0) {
  console.error(`\n${failures} build_cache test(s) failed.`);
  process.exit(1);
}
console.log('\nall build_cache tests passed.');
process.exit(0);
