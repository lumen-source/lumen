// honesty_gate.mjs - the automated anti-gaming harness for every "Lumen beats/matches X" claim.
//
// WHY THIS EXISTS: three prior "Lumen beats C" reports were false. (1) a strawman baseline; (2) a
// hand-written NEON kernel with the benchmark's option baked in, spliced into the emitted C by a host
// regex; (3) the SAME hardcoded Black-Scholes NEON kernel relocated INTO emit_fn.lm, gated on a
// hardcoded IR pc (`entry == 133`) so it fires only for the one benchmark program. Each printed a great
// number; none was a general capability. This harness makes the catch automatic and, critically,
// LOCATION-PROOF: gate G7 authors its OWN novel program the gamer never saw and checks the claimed
// capability actually works on it. A benchmark-specific kernel (in the host, a header, OR emit_fn.lm)
// cannot fake that. Implements the load-bearing G1-G8 from LUMEN_UNIVERSAL_COVERAGE_PLAN.md:
//   G1 no host-side codegen  G2 no baked inputs  G3 honest-baseline perf (ratchet)
//   G4 accuracy-gated  G5 reproducibility (median+warmup)  G6 coverage
//   G7 SIMD/beats-C claims must be GENERAL (novel-program generality)  G8 differential vs reference
//
// Usage:  node bench/honesty_gate.mjs [projectDir]
// Exit 0 = all gates pass; non-zero = at least one failed (the number is not to be believed).

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const PROJECT = path.resolve(process.argv[2] || path.join(path.dirname(fileURLToPath(import.meta.url)), '..'));
const NATIVE = path.join(PROJECT, 'native');
const ULP_BOUND = 4;

// G3 ratchet: Lumen throughput / honest-scalar-libm-C throughput. Effective (fails below floor, catching
// regressions and gamed-away wins); enhanceable (raise as Lumen earns it; prints headroom). Override via
// HONESTY_PERF_TARGET. The floor is the HONEST current level, not an aspiration - a target Lumen can't
// meet would just paint honest code red. It rises only when a REAL, gate-passing (G1c+G7) change earns it.
//   0.60 now (honest scalar) -> 1.00 (a real GENERAL SIMD-lowering pass) -> 1.50 (unroll+const-lift) -> 2.00
const PERF_TARGET = Number(process.env.HONESTY_PERF_TARGET || '0.60');
const PERF_LADDER = [0.60, 1.00, 1.50, 2.00];
const PERF_N = Number(process.env.HONESTY_PERF_N || '2000000');

const results = [];
const record = (gate, pass, detail) => { results.push({ gate, pass, detail }); console.log(`${pass ? 'PASS' : 'FAIL'}  ${gate}  ${detail}`); return pass; };
const emitFnSrc = () => fs.readFileSync(path.join(NATIVE, 'emit_fn.lm'), 'utf8');
const simdCapable = () => /vld1q_f64|float64x2_t|vfmaq/.test(emitFnSrc());

// ---------------------------------------------------------------------------
// G1 - No host-side codegen, AND no benchmark-specific special-casing in the emitter (STATIC).
//   (a) pipeline.mjs must not string-mutate the emitted C.
//   (b) no SIMD compute kernel in an injected host .mjs header.
//   (c) emit_fn.lm must not dispatch on a hardcoded IR pc or emit domain-specific hardcoded kernels
//       (the exact evasion of #177: `entry == 133` + emitting a canned Black-Scholes NEON kernel).
// ---------------------------------------------------------------------------
function g1_no_host_codegen() {
  const pipe = fs.readFileSync(path.join(NATIVE, 'pipeline.mjs'), 'utf8');
  const mutations = [...pipe.matchAll(/\bcsrc\s*=\s*[^;]*\.replace(All)?\(/g)].length;
  record('G1', mutations === 0, mutations === 0
    ? 'pipeline.mjs does not string-mutate the emitted C'
    : `pipeline.mjs rewrites the emitted C in ${mutations} place(s) (host-side codegen)`);

  // A LOOP/array kernel (vld1q/vst1q over memory) or a DOMAIN kernel (norm_cdf/bs_call/run_batch...) is
  // codegen the compiler must emit - it may not live in a host .mjs. But a general vectorized MATH
  // PRIMITIVE (neon_exp: float64x2_t -> float64x2_t, pure lanes, no memory, no domain name) is legitimate
  // runtime the compiler CALLS, exactly like a vectorized libm. That distinction is what G1b enforces now.
  const kernel = /vld1q_f64|vst1q_f64|run_batch|neon_norm_cdf|neon_bs|black.?scholes|_pricer/i;
  const anySimd = /float64x2_t|vfmaq_f64|vmulq_f64|vld1q_f64|__attribute__\s*\(\(\s*vector_size/;
  const isHarness = (f) => /_bench\.mjs$|_test\.mjs$|_diff\.mjs$|honesty_gate\.mjs$|harness\.mjs$/.test(f);
  const offenders = [];
  for (const f of fs.readdirSync(NATIVE)) {
    if (!f.endsWith('.mjs') || isHarness(f)) continue;
    if (kernel.test(fs.readFileSync(path.join(NATIVE, f), 'utf8'))) offenders.push(f);   // array/domain kernel only
  }
  if (anySimd.test(pipe)) offenders.push('pipeline.mjs');   // the driver must contain NO SIMD at all
  record('G1b', offenders.length === 0, offenders.length === 0
    ? 'no SIMD loop/domain kernels in host .mjs (math primitives like neon_exp are allowed runtime)'
    : `SIMD loop/domain kernel(s) in host file(s): ${offenders.join(', ')} (loop/array codegen must be emitted by Lumen)`);

  // (c) benchmark-specific special-casing INSIDE the emitter. A general compiler never dispatches on a
  // specific function's pc, never emits a domain kernel by name, never bakes a domain constant it was
  // not given. These are the fingerprints of "recognize the benchmark, paste the answer".
  const emit = emitFnSrc();
  const smells = [];
  if (/\b(entry|func_pc|pc|call_entry)\s*==\s*\d{2,}/.test(emit)) smells.push('dispatch on a hardcoded IR pc (e.g. `entry == 133`)');
  if (/norm_cdf|neon_norm_cdf|bs_call|black.?scholes|scan_bs/i.test(emit)) smells.push('emitter names a specific benchmark kernel (norm_cdf/bs_call/scan_bs...)');
  if (/0\.2316419|0\.319381530|1\.330274429/.test(emit)) smells.push('emitter bakes a domain constant (A&S CDF coefficients) not taken from the program');
  record('G1c', smells.length === 0, smells.length === 0
    ? 'emit_fn.lm has no benchmark-specific special-casing (general codegen)'
    : `emit_fn.lm is benchmark-specific, not a general compiler pass: ${smells.join('; ')}`);
}

// ---------------------------------------------------------------------------
// G7 - GENERALITY (the location-proof centerpiece). If the emitter can emit SIMD at all, then a NOVEL
// non-benchmark map that the gate authors HERE must actually vectorize and be correct. A kernel that
// only fires for the benchmark (host regex, header, or emit_fn.lm pc-match) cannot vectorize this - it
// has never seen it. If the emitter emits no SIMD, no SIMD/beats-C-via-SIMD claim is made -> N/A.
// ---------------------------------------------------------------------------
async function g7_generality() {
  if (!simdCapable()) { record('G7', true, 'emit_fn.lm emits no SIMD; scalar path, no SIMD claim (N/A)'); return; }
  const { buildAndRunFn } = await import(path.join(NATIVE, 'pipeline.mjs'));
  const N = 4096;
  // A novel transcendental map (Gaussian), NOT Black-Scholes: the exact shape a general Float-array
  // vectorizer must handle, and the exact shape a benchmark-pattern-matcher will miss.
  const novel = `fn g(x: Float) -> Float { return exp(0.0 - 0.5 * x * x) }
fn main(c: Console) -> Unit {
  let n = ${N}
  let xs = array(n)
  var i = 0
  while i < n { aset(xs, i, 0.0 - 2.0 + to_float(i) * 0.001) i = i + 1 }
  let ys = array(n)
  var j = 0
  while j < n { aset(ys, j, g(aget(xs, j))) j = j + 1 }
  var kk = 0
  var acc = 0.0
  while kk < n { acc = acc + aget(ys, kk) kk = kk + 1 }
  c.print_int(round(acc * 1000000.0))
}`;
  let csrc, got;
  try { const r = await buildAndRunFn(novel, '-O3'); csrc = r.csrc; got = BigInt(r.stdout.trim()); }
  catch (e) { record('G7', false, `novel map failed to build/run: ${e.message.slice(0, 100)}`); return; }
  const loopVectorized = /vld1q_f64\(&/.test(csrc);           // vector array-load in the loop
  let ref = 0; for (let i = 0; i < N; i++) { const x = -2.0 + i * 0.001; ref += Math.exp(-0.5 * x * x); }
  const refI = BigInt(Math.round(ref * 1000000));
  const d = got > refI ? got - refI : refI - got;
  const correct = d <= 5000n;                                 // ~1e-6 relative on the accumulated sum
  record('G7', loopVectorized && correct,
    `SIMD-capable emitter; NOVEL non-benchmark map (gaussian exp) vectorized=${loopVectorized} correct=${correct} (got ${got} ref ${refI})`
    + (loopVectorized ? '' : ' -> the SIMD fires only for the benchmark: benchmark-specific, not a general compiler capability'));
}

// ---------------------------------------------------------------------------
// G2 + G4 + G8 - No baked inputs, accuracy-gated, differential (DYNAMIC).
// ---------------------------------------------------------------------------
function bsProgram(S, K, r, T, n = 64) {
  return `
fn norm_cdf(x: Float) -> Float {
  if x < 0.0 { return 1.0 - norm_cdf(-x) }
  let k: Float = 1.0 / (1.0 + 0.2316419 * x)
  let poly: Float = k * (0.319381530 + k * (-0.356563782 + k * (1.781477937 + k * (-1.821255978 + k * 1.330274429))))
  let pdf: Float = 0.3989422804014327 * exp(-(x * x) / 2.0)
  return 1.0 - pdf * poly
}
fn bs_call(s: Float, k: Float, r: Float, t: Float, vol: Float) -> Float {
  let d1: Float = (ln(s / k) + (r + vol * vol / 2.0) * t) / (vol * sqrt(t))
  let d2: Float = d1 - vol * sqrt(t)
  return s * norm_cdf(d1) - k * exp(-r * t) * norm_cdf(d2)
}
fn main(c: Console) -> Unit {
  let n = ${n}
  let vols = array(n)
  var i = 0
  while i < n { aset(vols, i, 0.1 + to_float(i) * 0.0000001) i = i + 1 }
  var j = 0
  var acc = 0.0
  while j < n { acc = acc + bs_call(${S}.0, ${K}.0, ${r}, ${T}, aget(vols, j)) j = j + 1 }
  c.print_int(round(acc * 1000000.0))
}
`;
}
function bsCProgram(S, K, r, T, n) {
  return `#include <stdio.h>
#include <stdlib.h>
#include <math.h>
static double norm_cdf(double x){ if(x<0.0) return 1.0-norm_cdf(-x); double k=1.0/(1.0+0.2316419*x); double poly=k*(0.319381530+k*(-0.356563782+k*(1.781477937+k*(-1.821255978+k*1.330274429)))); double pdf=0.3989422804014327*exp(-(x*x)/2.0); return 1.0-pdf*poly; }
static double bs_call(double s,double k,double r,double t,double vol){ double d1=(log(s/k)+(r+vol*vol/2.0)*t)/(vol*sqrt(t)); double d2=d1-vol*sqrt(t); return s*norm_cdf(d1)-k*exp(-r*t)*norm_cdf(d2); }
int main(void){ long n=${n}; double* v=malloc(n*sizeof(double)); if(!v)return 1; for(long i=0;i<n;i++) v[i]=0.1+(double)i*0.0000001; double a=0.0; for(long i=0;i<n;i++) a+=bs_call(${S}.0,${K}.0,${r},${T},v[i]); printf("%lld\\n",(long long)llround(a*1000000.0)); free(v); return 0; }
`;
}
function referenceAcc(S, K, r, T) {
  const py = `
from mpmath import mp, mpf, sqrt, exp, log
mp.prec = 113
S,K,r,T = mpf('${S}'), mpf('${K}'), mpf('${r}'), mpf('${T}')
def ncdf(x):
    x=mpf(x)
    if x<0: return 1-ncdf(-x)
    k=1/(1+mpf('0.2316419')*x)
    poly=k*(mpf('0.319381530')+k*(mpf('-0.356563782')+k*(mpf('1.781477937')+k*(mpf('-1.821255978')+k*mpf('1.330274429')))))
    return 1-mpf('0.3989422804014327')*exp(-(x*x)/2)*poly
def bs(vol):
    vol=mpf(vol); d1=(log(S/K)+(r+vol*vol/2)*T)/(vol*sqrt(T)); d2=d1-vol*sqrt(T)
    return S*ncdf(d1)-K*exp(-r*T)*ncdf(d2)
acc=mpf(0)
for i in range(64): acc+=bs(mpf('0.1')+mpf(i)*mpf('0.0000001'))
import math
val=acc*mpf(1000000); lo=int(math.floor(val))
print(lo+1 if val-lo>=mpf('0.5') else lo)
`;
  return BigInt(execFileSync('uv', ['run', '--with', 'mpmath', 'python3', '-c', py], { encoding: 'utf8' }).trim());
}
async function g2_g4_no_baked_inputs() {
  const { buildAndRunFn } = await import(path.join(NATIVE, 'pipeline.mjs'));
  const options = [
    { S: 100, K: 100, r: '0.05', T: '1.0', label: 'benchmark-option' },
    { S: 120, K: 100, r: '0.03', T: '0.5', label: 'ITM, diff r/T' },
    { S: 90, K: 110, r: '0.08', T: '2.0', label: 'OTM, diff r/T' },
    { S: 100, K: 100, r: '0.05', T: '0.25', label: 'same S/K, diff T' },
  ];
  for (const o of options) {
    let got;
    try { got = BigInt((await buildAndRunFn(bsProgram(o.S, o.K, o.r, o.T), '-O3')).stdout.trim()); }
    catch (e) { record('G2', false, `${o.label}: build/run failed: ${e.message.slice(0, 80)}`); continue; }
    const ref = referenceAcc(o.S, o.K, o.r, o.T);
    const diff = got > ref ? got - ref : ref - got;
    record(o.label === 'benchmark-option' ? 'G4' : 'G2', diff <= BigInt(ULP_BOUND) * 8n,
      `${o.label} (S=${o.S},K=${o.K},r=${o.r},T=${o.T}): native=${got} ref=${ref} diff=${diff}`);
  }
}

// G3 + G5 - perf vs honest baseline, reproducible (median-5 + warmup).
async function g3_performance() {
  const { buildAndRunFn } = await import(path.join(NATIVE, 'pipeline.mjs'));
  const FLAGS = ['-ffp-contract=fast', '-fno-fast-math', '-O3'];
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'honesty-perf-'));
  const median = (xs) => xs.slice().sort((a, b) => a - b)[Math.floor(xs.length / 2)];
  const timeRun = (bin) => { const t = process.hrtime.bigint(); execFileSync(bin, { encoding: 'utf8' }); return Number(process.hrtime.bigint() - t) / 1e6; };
  fs.writeFileSync(path.join(dir, 'noop.c'), 'int main(void){return 0;}\n');
  execFileSync('clang', ['-O3', '-o', path.join(dir, 'noop'), path.join(dir, 'noop.c')]);
  const spawn = median(Array.from({ length: 7 }, () => timeRun(path.join(dir, 'noop'))));
  const rate = (bin) => { timeRun(bin); return PERF_N / (Math.max(0.001, median(Array.from({ length: 5 }, () => timeRun(bin))) - spawn) / 1000); }; // warmup + median-5 (G5)
  const nat = await buildAndRunFn(bsProgram(100, 100, '0.05', '1.0', PERF_N), '-O3');
  fs.writeFileSync(path.join(dir, 'nat.c'), nat.csrc.replace(/#define AHEAP_CAP \(1<<\d+\)/, '#define AHEAP_CAP (1<<24)'));
  execFileSync('clang', [...FLAGS, '-o', path.join(dir, 'nat'), path.join(dir, 'nat.c')]);
  fs.writeFileSync(path.join(dir, 'c.c'), bsCProgram(100, 100, '0.05', '1.0', PERF_N));
  execFileSync('clang', [...FLAGS, '-o', path.join(dir, 'c'), path.join(dir, 'c.c')]);
  const natRate = rate(path.join(dir, 'nat')), cRate = rate(path.join(dir, 'c'));
  const ratio = natRate / cRate;
  const nextRung = PERF_LADDER.find((x) => x > PERF_TARGET + 1e-9);
  const M = (r) => (r / 1e6).toFixed(1) + 'M/s';
  record('G3', ratio >= PERF_TARGET - 1e-9,
    `Lumen ${M(natRate)} vs honest-C ${M(cRate)} = ${ratio.toFixed(2)}x (target >= ${PERF_TARGET.toFixed(2)}x`
    + (nextRung ? `; ${ratio >= nextRung ? 'READY TO RAISE to' : 'headroom to'} ${nextRung.toFixed(2)}x)` : '; top rung)'));
  record('G5', true, 'timing is warmup + median-of-5, spawn-subtracted');
  fs.rmSync(dir, { recursive: true, force: true });
}

// Class wrapper so the d15 bench keeps importing { HonestyGate } - but every check now runs the REAL
// measuring logic above (ignores caller-supplied "trust me" values). This is the reconciliation: Gemini's
// API, Claude's teeth.
export class HonestyGate {
  constructor(domainName) { this.domainName = domainName; this.results = {}; }
  async runAll() { await runAllGates(); this.results = Object.fromEntries(results.map(r => [r.gate, r])); return this.results; }
  checkG1() { return g1_no_host_codegen(), results.filter(r => r.gate.startsWith('G1')).every(r => r.pass); }
  async checkG7() { await g7_generality(); return results.find(r => r.gate === 'G7')?.pass ?? false; }
}

async function runAllGates() {
  g1_no_host_codegen();
  try { await g7_generality(); } catch (e) { record('G7', false, `generality harness error: ${e.message.slice(0, 100)}`); }
  try { await g2_g4_no_baked_inputs(); } catch (e) { record('G2/G4', false, `harness error: ${e.message.slice(0, 100)}`); }
  try { await g3_performance(); } catch (e) { record('G3', false, `perf harness error: ${e.message.slice(0, 100)}`); }
}

// CLI
if (import.meta.url === `file://${process.argv[1]}`) {
  console.log(`\n=== HONESTY GATE  (project: ${PROJECT}) ===\n`);
  await runAllGates();
  const failed = results.filter(r => !r.pass);
  console.log(`\n${failed.length === 0 ? 'ALL GATES PASS - the number may be believed.' : `${failed.length} GATE(S) FAILED - the claim is REJECTED regardless of its number:`}`);
  for (const f of failed) console.log(`  - ${f.gate}: ${f.detail}`);
  process.exit(failed.length === 0 ? 0 : 1);
}
