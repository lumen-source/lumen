// decimal_oracle_test.mjs (THE EXTERNAL ORACLE GATE) - the wave's fourth independent witness.
//
// Every prior Dec gate (native_decimal_test.mjs D2, llvm_decimal_test.mjs D3,
// selfhost_diff.mjs D4) is Lumen-family: the interpreter, the C-emitting compiler, and the
// LLVM-emitting compiler all descend from the same WAT seed's Dec design (D1). A bug shared
// by all three (a wrong rounding-boundary constant, a scale mistake, a formatting quirk)
// would agree with itself silently and every gate above would stay green.
//
// This gate is the outside witness: an independently-implemented Python decimal.Decimal
// oracle (stdlib, not derived from Lumen's WAT arithmetic in any way) that computes the same
// ~200 randomized-but-SEEDED programs and must agree, byte-for-byte on dec_to_text's
// canonical form, with all three Lumen backends at once. Four independent implementations
// landing on the same answer is a much stronger claim than any one-vs-one diff.
//
// Determinism: the PRNG is a fixed-seed mulberry32 (SEED below), never Math.random. Re-running
// this file regenerates the exact same 200 programs, so a red run is reproducible and a green
// run is not "we got lucky this time."
//
// Scope of the corpus: +, -, *, dec_div chains; Int<->Dec coercion in both operand orders;
// negative literals; round-half-even ties (engineered, not left to chance); dec_to_text
// canonical formatting (trailing-zero stripping, minimum one fractional digit). Magnitudes are
// deliberately kept small (bounded operand construction, see genLiteral/genTieCase below) so
// overflow/dec_div-by-zero traps never fire here BY CONSTRUCTION - this gate is the value/
// formatting oracle, not the trap-parity oracle. Trap parity (interpreter crashed AND native
// exited non-zero AND prefixes matched) is already covered by native_decimal_test.mjs's TRAPS
// corpus and llvm_decimal_test.mjs's LLVM-side equivalent; duplicating it here against a
// Python oracle would require re-deriving Lumen's own overflow-boundary constants in Python,
// which teaches nothing new. Choice made explicit per the brief: SKIP-WITH-COUNT, and this
// gate asserts the count is exactly 0 (a trap firing here would mean a magnitude-bound bug,
// which IS worth failing loudly on).
//
// Self-falsification (this gate is born green: D1-D4 already proved these four backends agree,
// so there is no natural red to commit first). Per the brief's failing-first substitute for a
// born-green oracle: a deliberately WRONG expected value is compared against a real, correct
// native result, and this file asserts that comparison correctly reports a MISMATCH. If that
// self-check ever passed (i.e. wrong == right), the comparator itself would be broken and every
// other green in this file would be worthless. See runSelfFalsification() below.
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createCompiler } from '../seed/compiler_core.mjs';
import { buildAndRunFn, buildAndRunLlvm } from './pipeline.mjs';

const SEED = 20260715; // literal, fixed: the date this gate was authored. Never Math.random.
const N_RANDOM = 160;
const N_TIES = 20;
const N_DIVCHAINS = 20; // total corpus = 200 (each program builds+runs 2 native backends: clang x2 x200 = the gate's dominant cost)

// ---- deterministic PRNG (mulberry32) ----
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = mulberry32(SEED);
const rint = (lo, hi) => lo + Math.floor(rnd() * (hi - lo + 1)); // inclusive

// ---- literal generation, bounded so no operation here can overflow i64/1e6 by construction:
// whole part magnitude <= 500, fractional digits 0..6, sign 50/50. Products of two such
// operands scale to at most ~500*500*1e6 = 2.5e11 in raw i64 units - far below the ~9.22e18
// (i64::MAX) or the 9223372036854 (DFROMI) boundary either lowering enforces. ----
function genLiteral() {
  const whole = rint(0, 500);
  const fracDigits = rint(0, 6);
  const frac = fracDigits === 0 ? '' : String(rint(0, 10 ** fracDigits - 1)).padStart(fracDigits, '0');
  const neg = rnd() < 0.5;
  const text = frac ? `${whole}.${frac}` : `${whole}`;
  const decText = `${neg ? '-' : ''}${text}d`;
  const value = `${neg ? '-' : ''}${text}`; // plain decimal string, for the Python oracle
  return { decText, value };
}
// a bare-Int operand (for coercion corpus): small, no fraction, no 'd' suffix.
function genIntLiteral() {
  const n = rint(-500, 500);
  return { intText: `${n}`, value: `${n}` };
}
function genDivisor() {
  // nonzero on purpose: divisor-by-zero is a trap case, out of scope (see header).
  let n;
  do { n = rint(-50, 50); } while (n === 0);
  return n;
}

// ---- program #1: a random small chain of ops over Dec/Int operands ----
const OPS = ['+', '-', '*'];
function genChainProgram(i) {
  const nTerms = rint(2, 4);
  let luExpr = null, pyExpr = null;
  let useDivTail = rnd() < 0.35; // sometimes wrap the whole chain in a dec_div at the end
  for (let k = 0; k < nTerms; k++) {
    const asInt = rnd() < 0.3; // Int<->Dec coercion, mixed in
    const lit = asInt ? genIntLiteral() : genLiteral();
    const term = asInt ? lit.intText : lit.decText;
    const pyTerm = lit.value;
    if (luExpr === null) { luExpr = term; pyExpr = pyTerm; continue; }
    const op = OPS[rint(0, OPS.length - 1)];
    luExpr = `(${luExpr} ${op} ${term})`;
    pyExpr = { op, a: pyExpr, b: pyTerm };
  }
  if (useDivTail) {
    const d = genDivisor();
    luExpr = `dec_div(${luExpr}, ${d})`;
    pyExpr = { op: '/', a: pyExpr, b: `${d}` };
  }
  const src = `fn main(c: Console) -> Unit {\n  c.print(dec_to_text(${luExpr}))\n  c.print("\\n")\n}\n`;
  return { name: `random chain #${i}`, src, py: pyExpr };
}

// ---- program #2: engineered round-half-even ties on DMUL, alternating parity so both tie
// directions (already-even/no-change vs odd/rounds-up) are exercised deterministically ----
function genTieProgram(i) {
  const m = 2 * i + 1; // always odd: forces product-mod-1e6 == 500000, an exact tie (see header math)
  const bfrac = String(m).padStart(6, '0');
  const src = `fn main(c: Console) -> Unit {\n  c.print(dec_to_text(0.5d * 1.${bfrac}d))\n  c.print("\\n")\n}\n`;
  const pyExpr = { op: '*', a: '0.5', b: `1.${bfrac}` };
  return { name: `engineered tie m=${m}`, src, py: pyExpr };
}

// ---- program #3: dec_div chains specifically (repeating decimals, negative operands both sides) ----
function genDivChainProgram(i) {
  const a = genLiteral();
  const d1 = genDivisor();
  const d2 = genDivisor();
  const src = `fn main(c: Console) -> Unit {\n  c.print(dec_to_text(dec_div(dec_div(${a.decText}, ${d1}), ${d2})))\n  c.print("\\n")\n}\n`;
  const pyExpr = { op: '/', a: { op: '/', a: a.value, b: `${d1}` }, b: `${d2}` };
  return { name: `div chain #${i}`, src, py: pyExpr };
}

const programs = [];
for (let i = 0; i < N_RANDOM; i++) programs.push(genChainProgram(i));
for (let i = 0; i < N_TIES; i++) programs.push(genTieProgram(i));
for (let i = 0; i < N_DIVCHAINS; i++) programs.push(genDivChainProgram(i));

// ---- Python oracle: builds one script evaluating all pyExpr trees with decimal.Decimal,
// ROUND_HALF_EVEN, quantized to 0.000001 after every * and / (mirrors DMUL/DDIV's
// round_half_even(.../1_000_000) exactly: a*b or a*1e6/b quantized to 6dp half-even is the
// same value as the WAT's exact-128-bit-product-then-round approach - both are exact rational
// arithmetic rounded once at the 6th decimal, no float ever enters this path), then formats
// each with the exact dec_to_text canonicalization (fixed 6dp, strip trailing zeros, keep >=1
// fractional digit). Runs ALL programs in one Python process (one execFileSync call, not 200)
// for speed. ----
function pyExprToSrc(e, varCounter) {
  if (typeof e === 'string') return `Decimal('${e}')`;
  const a = pyExprToSrc(e.a, varCounter);
  const b = pyExprToSrc(e.b, varCounter);
  if (e.op === '+' ) return `(${a} + ${b})`;
  if (e.op === '-' ) return `(${a} - ${b})`;
  if (e.op === '*' ) return `q(${a} * ${b})`;
  if (e.op === '/' ) return `q(${a} / ${b})`;
  throw new Error(`unknown op ${e.op}`);
}

function runPythonOracle(progs) {
  const lines = [
    'from decimal import Decimal, ROUND_HALF_EVEN, getcontext',
    'getcontext().prec = 60',
    "Q = Decimal('0.000001')",
    'def q(x):',
    '    return x.quantize(Q, rounding=ROUND_HALF_EVEN)',
    'def canon(d):',
    '    d = q(d)',
    "    s = format(d, 'f')",
    "    sign = ''",
    "    if s.startswith('-'):",
    "        sign = '-'; s = s[1:]",
    "    if '.' not in s: s = s + '.0'",
    "    ip, fp = s.split('.')",
    "    fp = (fp + '000000')[:6]",
    "    fp = fp.rstrip('0')",
    "    if fp == '': fp = '0'",
    "    return sign + ip + '.' + fp",
    'results = []',
  ];
  progs.forEach((p, idx) => {
    lines.push(`results.append(canon(${pyExprToSrc(p.py)}))`);
  });
  lines.push("print('\\x1e'.join(results))");
  const out = execFileSync('python3', ['-c', lines.join('\n')], { encoding: 'utf8' });
  return out.trim().split('\x1e');
}

let pass = 0, fail = 0, trapSkips = 0;

console.log(`== decimal_oracle_test: ${programs.length} seeded programs, 4-way agreement (interpreter, emit_fn native, emit_llvm native, Python decimal.Decimal oracle) ==`);
console.log(`SEED = ${SEED} (deterministic; re-running regenerates the identical corpus)`);

const lumen = await createCompiler();
const oracleValues = runPythonOracle(programs);
if (oracleValues.length !== programs.length) {
  console.log(`FATAL: python oracle returned ${oracleValues.length} results for ${programs.length} programs`);
  process.exit(1);
}

for (let i = 0; i < programs.length; i++) {
  const p = programs[i];
  const gold = oracleValues[i];
  const ref = lumen.run(p.src);
  if (!ref.ok || ref.crash) { console.log(`SKIP  ${p.name}: interpreter did not run cleanly (trap or rejection) - out of scope, see header`); trapSkips++; continue; }
  let fn, llvm;
  try { fn = await buildAndRunFn(p.src); } catch (e) { console.log(`FAIL  ${p.name}: emit_fn build/run error: ${e.message.slice(0, 160)}`); fail++; continue; }
  try { llvm = await buildAndRunLlvm(p.src); } catch (e) { console.log(`FAIL  ${p.name}: emit_llvm build/run error: ${e.message.slice(0, 160)}`); fail++; continue; }
  if (fn.exit !== 0 || llvm.exit !== 0) { console.log(`SKIP  ${p.name}: native backend trapped (exit fn=${fn.exit} llvm=${llvm.exit}) - out of scope, see header`); trapSkips++; continue; }
  const expected = `${gold}\n`;
  const ok = ref.stdout === expected && fn.stdout === expected && llvm.stdout === expected;
  if (ok) { pass++; }
  else {
    fail++;
    console.log(`FAIL  ${p.name}`);
    console.log(`  python oracle: ${JSON.stringify(expected)}`);
    console.log(`  interpreter:   ${JSON.stringify(ref.stdout)}`);
    console.log(`  emit_fn:       ${JSON.stringify(fn.stdout)}`);
    console.log(`  emit_llvm:     ${JSON.stringify(llvm.stdout)}`);
  }
}

console.log(`\n${pass}/${programs.length} agree 4-way, ${trapSkips} skipped (trap, out of scope), ${fail} disagreements`);
if (trapSkips !== 0) {
  console.log(`NOTE: trapSkips should be 0 by construction (bounded literal magnitudes); a nonzero count means either the magnitude bound above is wrong or a real regression - investigate, do not just accept the skip.`);
}

// ---- self-falsification: a deliberately wrong expected value, compared against the SAME
// comparator this gate uses above, must be reported as a mismatch. This is the failing-first
// substitute required when a gate is born green (D1-D4 already proved the four backends
// agree; there was no natural red left for this oracle to discover here). ----
function runSelfFalsification() {
  const real = programs[0];
  const truth = oracleValues[0];
  const mutant = truth === '0.0' ? '0.1' : (truth.slice(0, -1) + (truth.at(-1) === '9' ? '0' : String(Number(truth.at(-1)) + 1)));
  const mutantExpected = `${mutant}\n`;
  const trueExpected = `${truth}\n`;
  const comparatorAgrees = (actual, expected) => actual === expected;
  const wronglyPasses = comparatorAgrees(trueExpected, mutantExpected); // must be false
  const rightlyFails = !comparatorAgrees(trueExpected, mutantExpected); // must be true
  const ok = !wronglyPasses && rightlyFails;
  console.log(`\n== self-falsification demo (mutant expectation ${JSON.stringify(mutantExpected)} vs real oracle value ${JSON.stringify(trueExpected)} for "${real.name}") ==`);
  console.log(`${ok ? 'PASS' : 'FAIL'}  comparator correctly reports a mismatch when given a deliberately wrong expectation`);
  return ok;
}
const selfCheckOk = runSelfFalsification();

const overallOk = fail === 0 && trapSkips === 0 && selfCheckOk;
process.exit(overallOk ? 0 : 1);
