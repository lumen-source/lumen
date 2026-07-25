#!/usr/bin/env node
// effects_gate.mjs (C0) - the capability-purity gate, built on seed/effects.mjs's derived
// per-function capability rows. Three checks, in order:
//
//   1. Soundness cross-check (BLOCKING, every scanned file, NO exemptions): a function whose
//      own signature carries no Console-typed parameter must have derived effects: [] - this is
//      the intended invariant per docs/spec/LUMEN_MU.md ("Exactly one capability [Console]... It
//      is the only effect and the only seam", only ever reachable by being threaded as a
//      parameter).
//
//      HISTORY, because this comment used to say the opposite and it matters. Until E0010 landed,
//      the compiler did not resolve the receiver of a `.print`/`.print_int` call at all: the
//      method-call dispatch in both seed/lumenc.wat and seed/lumenc.lm captured the receiver span
//      and then branched only on the METHOD name, never reading it. So `anything_at_all.print_int(x)`
//      compiled and PRINTED regardless of whether `anything_at_all` was declared, which made
//      RULES.md Rule 5 ("a function with no capability parameters is provably pure") false in the
//      implementation rather than merely unchecked. This gate was therefore testing a STYLE
//      CONVENTION, and it said so honestly, with `main` carved out because three corpus files
//      relied on the slack.
//
//      That hole is now closed at the language level. E0010 rejects an unresolved receiver, E0011
//      rejects an unknown capability method (which previously fell through to an unconditional
//      PRINTINT, so `c.print_float(1.5)` printed the raw f64 bit pattern), the three files were
//      given explicit `console: Console` parameters like the other 121 mains already had, and the
//      `main` exemption is deleted. This check now covers every scanned function with no
//      carve-outs. Note the residual gap it still does NOT close: the receiver must resolve to an
//      in-scope binding, but its TYPE is not yet checked, because Console has no distinct type tag
//      (seed/lumenc.lm's ty_tag returns 0 for it, the same as Int). Closing that is Capabilities
//      v1 (docs/rfcs/0001-capabilities-v1.md) and it changes emitted TYPEMAP words, so it is
//      deliberately a separate change.
//   2. Finance kernels pure (BLOCKING, named): every function in examples/finance/*.lm without a
//      Console parameter is individually named and asserted pure, in its own report section - the
//      concrete, marketable claim ("the pricing math is provably untainted by I/O") that (1)
//      already proves structurally but which deserves to be seen and named, not just implied by a
//      generic pass.
//   3. Purity-fraction ratchet (BLOCKING on regression only): pureFunctions/totalFunctions across
//      the full scanned corpus (mu/examples/*.lm + examples/finance/*.lm) must not fall below the
//      fraction pinned in docs/EFFECTS_BASELINE.json. An IMPROVED fraction is reported and a
//      re-pin is suggested, never required - unlike tools/purity_gate.mjs (which tracks a
//      different notion, toolchain-dependency debt, and is purely advisory/never blocking), this
//      ratchet DOES block on regression: purity here is a claim about the corpus itself, not
//      accumulating infrastructure debt, so it is allowed to only ever hold steady or improve.
//
// Usage:
//   node tools/effects_gate.mjs           run all three checks (the CI gate)
//   node tools/effects_gate.mjs --pin     (re)write docs/EFFECTS_BASELINE.json from the current tree

import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCompiler } from '../seed/compiler_core.mjs';
import { effectsFromSource, CAPABILITY_REGISTRY } from '../seed/effects.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const BASELINE_PATH = path.join(REPO_ROOT, 'docs', 'EFFECTS_BASELINE.json');

// Both directories are, by their own established role in this repo, expected to always compile:
// mu/examples/*.lm is "the Lumen-mu conformance corpus" (seed/corpus.mjs's own description), and
// examples/finance/*.lm is the certified-kernel showcase most of which is already gated via
// seed/corpus.mjs. A compile failure inside either is therefore treated as a gate failure below,
// not a silent skip - this doubles as a light compileability re-check of both directories.
const SCAN_DIRS = ['mu/examples', 'examples/finance'];

// ---------------------------------------------------------------------------
// Pure, testable core (no fs globbing, no compiler, no git) - see tools/effects_gate_test.mjs.
// ---------------------------------------------------------------------------

// A function's own signature text carries a Console-typed parameter iff it has a `: Console`
// parameter annotation. Lumen-mu's grammar puts parameter types after a bare `name: Type`, never
// after `->` (the return type), so this is unambiguous for the current grammar (docs/spec/
// LUMEN_MU.md section 2).
export function hasConsoleParam(signature) {
  return /:\s*Console\b/.test(signature || '');
}

// Soundness cross-check over one file's derived function rows: every row with no Console
// parameter must be pure. There is NO LONGER a `main` exemption. The exemption existed because
// the compiler did not resolve a print call's receiver at all, so a zero-parameter
// `main() { console.print_int(...) }` compiled on that slack; E0010 closed that hole and the
// three files that relied on it (mu/examples/count.lm, mu/examples/sum_loop.lm,
// examples/hostdata/decide_kernel.lm) now take an explicit `console: Console` like the other
// 121 mains in the corpus already did. Removing the carve-out makes this check strictly
// stronger: it now covers every function in the scanned set, `main` included.
// Returns an array of human-readable failure strings (empty = clean).
export function checkSoundness(filePath, functions) {
  const failures = [];
  for (const f of functions) {
    if (!hasConsoleParam(f.signature) && f.effects.length > 0) {
      failures.push(
        `${filePath}: ${f.name} (line ${f.line}) has no Console parameter but derived effects ` +
        `${JSON.stringify(f.effects)} - this should be structurally impossible; likely an effects.mjs bug`,
      );
    }
  }
  return failures;
}

// The named "finance kernels pure" assertion: every finance-file function without a Console
// parameter must be pure, reported by name. Returns { pass: [{path,name}], fail: [{path,name,effects}] }.
export function checkFinanceKernels(financeFunctionsByFile) {
  const pass = [], fail = [];
  for (const [filePath, functions] of financeFunctionsByFile) {
    for (const f of functions) {
      if (hasConsoleParam(f.signature)) continue;   // not a kernel candidate (the I/O wrapper itself)
      if (f.effects.length === 0) pass.push({ path: filePath, name: f.name });
      else fail.push({ path: filePath, name: f.name, effects: f.effects });
    }
  }
  return { pass, fail };
}

// Ratchet comparison via cross-multiplication (avoids float precision issues from comparing two
// division results directly). Returns true iff `current` is a REGRESSION vs `baseline` (strictly
// worse purity fraction). Equal or improved fractions are not a regression.
export function isRatchetRegression(current, baseline) {
  if (baseline.total === 0) return false;   // nothing pinned yet to regress against
  if (current.total === 0) return true;     // scanned nothing: always a regression vs any real baseline
  return current.pure * baseline.total < baseline.pure * current.total;
}

// ---------------------------------------------------------------------------
// fs/compiler-facing glue (thin, mirrors purity_gate.mjs's own git-facing functions in style).
// ---------------------------------------------------------------------------

function listLmFiles(dir) {
  const full = path.join(REPO_ROOT, dir);
  if (!existsSync(full)) return [];
  return readdirSync(full)
    .filter((f) => f.endsWith('.lm'))
    .sort()
    .map((f) => path.join(dir, f));
}

// Compile + derive effects for every .lm file in SCAN_DIRS. Throws (with a clear message) on the
// first compile failure - deliberate, per the header comment: these directories are supposed to
// always compile, so a failure here is itself the finding, not something to route around.
async function scanCorpus() {
  const lumen = await createCompiler();
  const results = [];   // [{ path, functions }]
  for (const dir of SCAN_DIRS) {
    for (const relPath of listLmFiles(dir)) {
      const source = readFileSync(path.join(REPO_ROOT, relPath), 'utf8');
      const r = effectsFromSource(lumen, source);
      if (!r.ok) {
        const names = (r.rawDiags || []).map((d) => d.name || `code ${d.code}`).join(', ');
        throw new Error(`${relPath} failed to compile (${SCAN_DIRS.join(', ')} must always compile): ${names}`);
      }
      results.push({ path: relPath, functions: r.functions });
    }
  }
  return results;
}

function totals(results) {
  let total = 0, pure = 0;
  for (const r of results) {
    total += r.functions.length;
    pure += r.functions.filter((f) => f.effects.length === 0).length;
  }
  return { total, pure };
}

function currentHeadSha() {
  try { return execSync('git rev-parse HEAD', { cwd: REPO_ROOT, encoding: 'utf8' }).trim(); }
  catch { return 'unknown'; }
}

function loadBaseline() {
  if (!existsSync(BASELINE_PATH)) return null;
  try { return JSON.parse(readFileSync(BASELINE_PATH, 'utf8')); }
  catch { return null; }
}

function writeBaseline(results) {
  const { total, pure } = totals(results);
  const baseline = {
    generated_from: currentHeadSha(),
    registry: Object.keys(CAPABILITY_REGISTRY),
    totals: { files: results.length, functions: total, pure, impure: total - pure, purityFraction: total === 0 ? 1 : pure / total },
    files: results.map((r) => ({
      path: r.path,
      functions: r.functions.length,
      pure: r.functions.filter((f) => f.effects.length === 0).length,
    })),
  };
  writeFileSync(BASELINE_PATH, JSON.stringify(baseline, null, 2) + '\n');
  return baseline;
}

async function main() {
  const pin = process.argv.includes('--pin');
  const results = await scanCorpus();

  if (pin) {
    const baseline = writeBaseline(results);
    console.log(`effects_gate: baseline pinned at HEAD ${baseline.generated_from}`);
    console.log(`effects_gate: ${baseline.totals.functions} functions across ${baseline.totals.files} files, ` +
      `${baseline.totals.pure} pure (${(baseline.totals.purityFraction * 100).toFixed(1)}%)`);
    return;
  }

  let failures = 0;

  // 1. Soundness cross-check, every scanned file.
  const soundnessFailures = results.flatMap((r) => checkSoundness(r.path, r.functions));
  if (soundnessFailures.length > 0) {
    console.error(`effects_gate: FAIL - ${soundnessFailures.length} soundness violation(s):`);
    for (const f of soundnessFailures) console.error(`  - ${f}`);
    failures += soundnessFailures.length;
  } else {
    console.log('effects_gate: PASS - soundness cross-check (no function without a Console parameter has derived effects)');
  }

  // 2. Finance kernels pure, named.
  const financeResults = results.filter((r) => r.path.startsWith('examples/finance/'));
  const financeByFile = new Map(financeResults.map((r) => [r.path, r.functions]));
  const { pass: kernelPass, fail: kernelFail } = checkFinanceKernels(financeByFile);
  if (kernelFail.length > 0) {
    console.error(`effects_gate: FAIL - ${kernelFail.length} finance kernel(s) not pure:`);
    for (const f of kernelFail) console.error(`  - ${f.path}: ${f.name} has effects ${JSON.stringify(f.effects)}`);
    failures += kernelFail.length;
  } else {
    console.log(`effects_gate: PASS - ${kernelPass.length} finance kernel(s) pure across ${financeResults.length} file(s):`);
    for (const f of kernelPass) console.log(`    ${f.path}: ${f.name}`);
  }

  // 3. Purity-fraction ratchet.
  const current = totals(results);
  const baseline = loadBaseline();
  if (!baseline) {
    console.error('effects_gate: FAIL - no baseline found at docs/EFFECTS_BASELINE.json');
    console.error('effects_gate: run `node tools/effects_gate.mjs --pin` to create one');
    failures += 1;
  } else {
    const baselineTotals = { pure: baseline.totals.pure, total: baseline.totals.functions };
    const curFraction = current.total === 0 ? 0 : current.pure / current.total;
    const baseFraction = baselineTotals.total === 0 ? 0 : baselineTotals.pure / baselineTotals.total;
    if (isRatchetRegression(current, baselineTotals)) {
      console.error(
        `effects_gate: FAIL - purity fraction regressed: ${(curFraction * 100).toFixed(1)}% ` +
        `(${current.pure}/${current.total}) vs baseline ${(baseFraction * 100).toFixed(1)}% ` +
        `(${baselineTotals.pure}/${baselineTotals.total}, pinned at ${baseline.generated_from})`,
      );
      failures += 1;
    } else if (current.pure * baselineTotals.total > baselineTotals.pure * current.total) {
      console.log(
        `effects_gate: PASS - purity fraction IMPROVED: ${(curFraction * 100).toFixed(1)}% ` +
        `(${current.pure}/${current.total}) vs baseline ${(baseFraction * 100).toFixed(1)}%. ` +
        'Consider re-pinning: node tools/effects_gate.mjs --pin',
      );
    } else {
      console.log(`effects_gate: PASS - purity fraction holds at ${(curFraction * 100).toFixed(1)}% (${current.pure}/${current.total})`);
    }
  }

  if (failures > 0) {
    console.error(`\neffects_gate: FAIL - ${failures} issue(s) across ${results.length} file(s), ${current.total} function(s)`);
    process.exit(1);
  }
  console.log(`\neffects_gate: PASS - ${results.length} file(s), ${current.total} function(s), all checks clean`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => { console.error(`effects_gate: FAIL - ${e.message}`); process.exit(1); });
}
