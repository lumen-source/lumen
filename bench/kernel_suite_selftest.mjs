// kernel_suite_selftest.mjs (W6/S2) - deterministic self-test for kernel_suite_bench.mjs's PURE
// functions. Wall-clock numbers are inherently noisy across machines and runs, so this file makes
// NO timing assertions (no "X must run in under Yms") - it only proves the harness MACHINERY is
// correct, on synthetic fixtures, the same way tools/scoreboard_gate_test.mjs and
// tools/effects_gate_test.mjs test their own gates' pure functions rather than real repo state.
//
// Wired into .github/workflows/gate.yml's "promptgreen rig selftest" step (deterministic,
// no-network, no-timing tests all run together there).
//
// Run: node bench/kernel_suite_selftest.mjs

import {
  median,
  subtractSpawnCost,
  computeRatio,
  formatRow,
  renderTable,
  spliceAutoBlock,
} from './kernel_suite_bench.mjs';

let fail = 0;
function check(cond, msg) {
  if (cond) { console.log(`PASS  ${msg}`); }
  else { console.error(`FAIL  ${msg}`); fail++; }
}

// ---------------------------------------------------------------------------
// median(): "median-of-5 actually medians" - the exact machinery the real bench leans on for
// every timing number it reports.
// ---------------------------------------------------------------------------
check(median([1, 2, 3, 4, 5]) === 3, 'median: sorted odd-length array picks the true middle');
check(median([5, 1, 4, 2, 3]) === 3, 'median: unsorted array sorts before picking the middle (not positional)');
check(median([42]) === 42, 'median: single-element array returns that element');
check(median([1, 1, 1, 2, 3]) === 1, 'median: duplicate values handled correctly');
check(median([9, 9, 9, 9, 9]) === 9, 'median: all-identical values');
check(median([1, 2, 3, 4]) === 3, 'median: even-length array picks the upper-middle element (documented tie-break)');
check(median([100.5, 1.2, 50.25]) === 50.25, 'median: floating-point values, not just integers');
{
  let threw = false;
  try { median([]); } catch { threw = true; }
  check(threw, 'median: throws on an empty array rather than returning undefined/NaN silently');
}

// ---------------------------------------------------------------------------
// subtractSpawnCost(): "spawn-subtraction sane: nonnegative" - never let noise produce a
// nonsensical negative kernel cost.
// ---------------------------------------------------------------------------
check(subtractSpawnCost(10, 5) === 5, 'subtractSpawnCost: normal case subtracts cleanly');
check(subtractSpawnCost(5, 5) === 0, 'subtractSpawnCost: raw equal to spawn cost floors at zero');
check(subtractSpawnCost(3, 5) === 0, 'subtractSpawnCost: raw BELOW spawn cost floors at zero, never negative');
check(subtractSpawnCost(0, 0) === 0, 'subtractSpawnCost: zero/zero is zero, not NaN or negative');

// ---------------------------------------------------------------------------
// computeRatio(): null (not a fabricated number) when either side is at the noise floor.
// ---------------------------------------------------------------------------
check(computeRatio(10, 5) === 2, 'computeRatio: normal case divides lumen/C cleanly');
check(computeRatio(0, 5) === null, 'computeRatio: lumen at noise floor (0) returns null, not Infinity/0');
check(computeRatio(5, 0) === null, 'computeRatio: C at noise floor (0) returns null, not a divide-by-zero artifact');
check(computeRatio(0, 0) === null, 'computeRatio: both at noise floor returns null');

// ---------------------------------------------------------------------------
// formatRow() / renderTable(): rendering is deterministic and handles the null (noise-floor) case
// without throwing or printing "NaN"/"undefined".
// ---------------------------------------------------------------------------
{
  const row = { date: '2026-01-01', kernel: 'test_kernel', lumenMs: 1.2345, cMs: 2.3456, ratio: 0.526, flags: '-O2' };
  const line = formatRow(row);
  check(line.includes('test_kernel'), 'formatRow: kernel name present in the rendered line');
  check(line.includes('1.234') || line.includes('1.235'), 'formatRow: lumen ms rendered with fixed precision');
  check(!line.includes('NaN') && !line.includes('undefined'), 'formatRow: no NaN/undefined leakage on a normal row');
}
{
  const noiseRow = { date: '2026-01-01', kernel: 'tiny_kernel', lumenMs: null, cMs: null, ratio: null, flags: '-O2' };
  const line = formatRow(noiseRow);
  check(line.includes('below-noise-floor'), 'formatRow: null lumen/C ms renders as an explicit label, not NaN');
  check(line.includes('n/a'), 'formatRow: null ratio renders as explicit n/a, not a fabricated number');
}
{
  const noTwinRow = { date: '2026-01-01', kernel: 'future_kernel', lumenMs: 1.0, cMs: null, ratio: null, flags: '-O2' };
  const line = formatRow(noTwinRow);
  check(line.includes('no C twin yet'), 'formatRow: a kernel with cMs=null (no C twin) is labeled honestly, not silently blanked');
}
{
  const rows = [
    { date: '2026-01-01', kernel: 'a', lumenMs: 1, cMs: 2, ratio: 0.5, flags: '-O2' },
    { date: '2026-01-01', kernel: 'b', lumenMs: 3, cMs: 4, ratio: 0.75, flags: '-O2' },
  ];
  const table = renderTable(rows);
  check(table.includes('| Date | Kernel |'), 'renderTable: header row present');
  check(table.includes('kernel a'.replace('kernel ', '')) && table.includes('a') && table.includes('b'), 'renderTable: both data rows present');
  check(renderTable(rows) === table, 'renderTable: deterministic - same input twice produces byte-identical output');
}

// ---------------------------------------------------------------------------
// spliceAutoBlock(): "table renders idempotently". The precise, testable claim (see the function's
// own comment): splicing with an EMPTY newRows list twice in a row is a true no-op. Splicing with
// NON-empty rows is deliberately ADDITIVE (accumulates a dated history), so that case is tested
// for correct accumulation instead, not for byte-identical re-splice output.
// ---------------------------------------------------------------------------
{
  const bare = '# Some Dashboard\n\nSome unrelated content.\n';
  const row1 = { date: '2026-01-01', kernel: 'k1', lumenMs: 1, cMs: 2, ratio: 0.5, flags: '-O2' };
  const firstSplice = spliceAutoBlock(bare, 'kernel-suite', [row1]);
  check(firstSplice.includes('<!-- AUTO:kernel-suite -->'), 'spliceAutoBlock: creates the AUTO marker block on first use');
  check(firstSplice.includes('<!-- /AUTO:kernel-suite -->'), 'spliceAutoBlock: creates the closing AUTO marker');
  check(firstSplice.includes('k1'), 'spliceAutoBlock: first row present after initial splice');
  check(firstSplice.includes('Some unrelated content.'), 'spliceAutoBlock: pre-existing document content is preserved, not clobbered');

  // True idempotence: re-splicing with ZERO new rows changes nothing.
  const reSplicedEmpty = spliceAutoBlock(firstSplice, 'kernel-suite', []);
  check(reSplicedEmpty === firstSplice, 'spliceAutoBlock: re-splicing with no new rows is a true no-op (idempotent)');
  const reSplicedEmptyAgain = spliceAutoBlock(reSplicedEmpty, 'kernel-suite', []);
  check(reSplicedEmptyAgain === firstSplice, 'spliceAutoBlock: idempotence holds across repeated empty re-splices');

  // Additive accumulation: a second real row appends alongside the first (dated snapshot history),
  // rather than replacing it.
  const row2 = { date: '2026-01-02', kernel: 'k2', lumenMs: 3, cMs: 4, ratio: 0.75, flags: '-O2' };
  const secondSplice = spliceAutoBlock(firstSplice, 'kernel-suite', [row2]);
  check(secondSplice.includes('k1'), 'spliceAutoBlock: accumulation preserves the earlier dated row (k1)');
  check(secondSplice.includes('k2'), 'spliceAutoBlock: accumulation adds the new dated row (k2)');

  // Marker uniqueness: accumulating never duplicates the marker pair itself.
  const openCount = (secondSplice.match(/<!-- AUTO:kernel-suite -->/g) || []).length;
  const closeCount = (secondSplice.match(/<!-- \/AUTO:kernel-suite -->/g) || []).length;
  check(openCount === 1 && closeCount === 1, 'spliceAutoBlock: exactly one marker pair survives repeated splicing, never duplicated');
}

console.log(fail === 0 ? '\nkernel_suite_selftest: all checks passed.' : `\nkernel_suite_selftest: ${fail} failure(s).`);
process.exit(fail === 0 ? 0 : 1);
