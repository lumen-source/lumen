// build_cache.mjs - content-addressed cache for the native compile-to-BINARY step
// (clang on the emitted C source), scoped to pipeline.mjs's buildAndRunFnResident.
//
// Why here, not earlier in the pipeline: a prior measurement (this week) found that warming the
// Lumen-to-IR compile step (compileToIRAuto's resident-server round trip) gave ~1.0x end-to-end
// speedup for buildAndRunFnResident specifically, because clang's own compile-and-link dominates
// wall time for these small kernels, not the IR-compile step. The real lever is skipping clang
// entirely when the exact same emitted C has been built before - extremely common in iterative
// agent-driven development, where the same kernel gets tweaked and recompiled repeatedly, or the
// exact same program is run many times in a row.
//
// Same content-addressed shape as seed/cache.mjs (source hash + toolchain-identity hash + kind),
// deliberately: one mental model for "cache" in this repo. Differs in what it keys on (the
// EMITTED C, i.e. csrc, not the Lumen source - two different Lumen sources that emit the same C
// are a legitimate, desirable hit here) and in what it stores (an executable binary on disk, not
// a JSON blob).
//
// CORRECTNESS IS THE ONLY THING THAT MATTERS HERE. A cache that returns the wrong binary for a
// given source is strictly worse than no cache at all: it would run the correct-looking Lumen
// program against different logic and both the diagnostic and the misprediction would be
// invisible to the caller. Two independent defenses against that, not one:
//   1. The cache key folds in the opt flag and a clang-identity hash, so an opt-level change or a
//      clang upgrade can never reuse a binary built under different codegen.
//   2. On every cache HIT, before the binary is trusted, the exact csrc text this entry was
//      built from is read back from disk and compared byte-for-byte against the csrc of the
//      current request. A SHA-256 collision is cryptographically implausible, but this check
//      also catches a much likelier bug class: a key-construction mistake (forgetting to fold in
//      `opt`, a stale env var, ...) that would otherwise silently alias two different C sources
//      to the same directory. Any mismatch is treated as a miss - rebuild, never wrong-binary.
// See build_cache_test.mjs for the tests that exercise both defenses.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Repo-local, same convention as seed/.lumen-cache (see seed/cache.mjs): a directory-local
// .gitignore keeps it out of git without touching the repo-root .gitignore. LUMEN_BUILD_CACHE_DIR
// lets tests (and anyone debugging a cache bug) point at an isolated scratch directory instead of
// this repo's real cache.
export const CACHE_DIR_PATH = process.env.LUMEN_BUILD_CACHE_DIR
  ? path.resolve(process.env.LUMEN_BUILD_CACHE_DIR)
  : path.join(__dirname, '.native-build-cache');

function sha256(data) {
  return crypto.createHash('sha256').update(data).digest('hex');
}

// clang --version is spawned at most once per process (module-level memo, same pattern as
// native_compile.mjs's `cachedBin`) - paying one extra spawn per long-running process (the MCP
// server, the daemon) to fold clang's identity into every cache key is a rounding error; paying
// it on every cached call would eat into the very speedup this cache exists to deliver. Trade-off
// this implies: if clang is upgraded while a long-running process (lumend, the MCP server) is
// still alive, that process keeps using the OLD clang's identity hash until it restarts - a stale
// binary is never served (the identity is still a real fingerprint of whatever clang built it),
// but a process that outlives a clang upgrade also won't pick up new-clang's cache entries until
// restarted. Documented, not silently assumed.
let cachedClangIdentity = null;
function clangIdentity() {
  if (cachedClangIdentity) return cachedClangIdentity;
  try {
    const out = execFileSync('clang', ['--version'], { encoding: 'utf8' });
    cachedClangIdentity = sha256(out).slice(0, 16);
  } catch {
    cachedClangIdentity = 'unknown-clang';
  }
  return cachedClangIdentity;
}

function noCache() {
  return process.env.LUMEN_NO_CACHE === '1';
}

// The cache key names every input that can change the binary this module produces: the emitted
// C text itself, the opt flag, the FIXED extra flags buildAndRunFnResident always passes
// (baked into the key literally, not read from a variable, so a future edit to those flags in
// pipeline.mjs cannot silently keep matching old entries built under different ones), and clang's
// own identity.
export function buildCacheKey(csrc, opt) {
  return `${sha256(csrc)}-${opt}-ffpcontract-off-fno-fast-math-${clangIdentity()}`;
}

function entryDir(key) {
  return path.join(CACHE_DIR_PATH, key);
}

// getCachedBinary(csrc, opt): path to a previously-built, VERIFIED-matching binary, or null on
// any miss - missing entry, unreadable/corrupt entry, or (see module header) a csrc readback
// mismatch. Never throws; a cache-read problem degrades to "rebuild", not a broken tool call.
export function getCachedBinary(csrc, opt) {
  if (noCache()) return null;
  const dir = entryDir(buildCacheKey(csrc, opt));
  const binPath = path.join(dir, 'bin');
  const srcPath = path.join(dir, 'src.c');
  try {
    const storedSrc = fs.readFileSync(srcPath, 'utf8');
    if (storedSrc !== csrc) return null;   // defense 2 (see module header) - never trust the key alone
    fs.accessSync(binPath, fs.constants.X_OK);
    return binPath;
  } catch {
    return null;
  }
}

// storeBinary(csrc, opt, builtBinPath): copy a freshly-built binary into the cache, keyed by
// content hash. Staged into a temp sibling directory first, then fs.renameSync'd into place so a
// concurrent reader (another process/call racing on the exact same key) never observes a
// partially-written entry - rename is atomic within the same filesystem, and the stage directory
// is created inside CACHE_DIR_PATH itself for that reason (os.tmpdir() can be a different
// filesystem, which would make the "rename" a slow, non-atomic copy). Best-effort: any failure
// here (read-only fs, race lost against another writer building the identical key) must not break
// the caller - the binary this call just built is still returned and used either way.
export function storeBinary(csrc, opt, builtBinPath) {
  if (noCache()) return;
  const finalDir = entryDir(buildCacheKey(csrc, opt));
  if (fs.existsSync(path.join(finalDir, 'bin'))) return;   // already cached under this exact key
  try {
    fs.mkdirSync(CACHE_DIR_PATH, { recursive: true });
    const stageDir = fs.mkdtempSync(path.join(CACHE_DIR_PATH, '.stage-'));
    try {
      fs.copyFileSync(builtBinPath, path.join(stageDir, 'bin'));
      fs.chmodSync(path.join(stageDir, 'bin'), 0o755);
      fs.writeFileSync(path.join(stageDir, 'src.c'), csrc);
      try {
        fs.renameSync(stageDir, finalDir);
      } catch {
        // Another writer won the race for this exact key. Same key means same csrc/opt/clang,
        // so their entry and ours would be byte-identical anyway - discard the redundant stage.
        fs.rmSync(stageDir, { recursive: true, force: true });
      }
    } catch {
      fs.rmSync(stageDir, { recursive: true, force: true });
    }
  } catch {
    // mkdirSync/mkdtempSync failure (e.g. read-only fs) - caching is best-effort, never fatal.
  }
}

// --- growth / manual cleanup ---
//
// This cache has NO automatic eviction. Each distinct (csrc, opt, clang) triple accumulates one
// small directory (a binary, typically tens of KB for these kernel-sized programs, plus its
// source text) forever. A real multi-day/multi-week agent-driven dev loop touching many distinct
// kernels will grow this directory roughly linearly with the number of DISTINCT programs it ever
// ran through buildAndRunFnResident, not with the number of calls (repeat calls on the same
// source are exactly the hits this cache exists to serve, so they cost zero additional entries).
// An LRU or size-capped eviction policy is a reasonable follow-up if this ever becomes a real
// disk-space problem in practice; it was left out of this change deliberately (out of scope for
// "prove the cache works and is correct" - see build_cache_test.mjs and PR body) rather than
// built partially and left untested. Until then, manual cleanup:
//   node native/build_cache_clean.mjs           # report size/entry count
//   node native/build_cache_clean.mjs --clear   # delete the whole cache (next call repopulates)
export function cacheStats() {
  let entries = 0, bytes = 0;
  let names;
  try { names = fs.readdirSync(CACHE_DIR_PATH); } catch { return { entries: 0, bytes: 0, dir: CACHE_DIR_PATH }; }
  for (const name of names) {
    if (name.startsWith('.stage-')) continue;   // an orphaned stage dir from an interrupted process, not a real entry
    const dir = path.join(CACHE_DIR_PATH, name);
    try {
      const binStat = fs.statSync(path.join(dir, 'bin'));
      const srcStat = fs.statSync(path.join(dir, 'src.c'));
      entries++;
      bytes += binStat.size + srcStat.size;
    } catch {
      // not a well-formed entry - skip it rather than fail the whole report
    }
  }
  return { entries, bytes, dir: CACHE_DIR_PATH };
}

export function clearCache() {
  fs.rmSync(CACHE_DIR_PATH, { recursive: true, force: true });
}
