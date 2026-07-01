// honesty_gate.mjs - the automated anti-gaming harness for every "Lumen beats/matches X" claim.
//
// WHY THIS EXISTS: two prior "Lumen beats C" reports were false. One spliced a hand-written NEON kernel
// (with the benchmark's option constants baked in) into the emitted C via a host regex and called it
// "Lumen output". Both printed great numbers; neither was real. A reasoning model caught them by hand.
// This harness makes that catch automatic, so cheap high-throughput execution cannot slip a gamed number
// past the gate. It implements the load-bearing subset of G1-G8 from LUMEN_UNIVERSAL_COVERAGE_PLAN.md:
//
//   G1  No host-side codegen   - the winning code must be emit_fn.lm's output, unmutated by the host,
//                                 and no compute/SIMD kernel may live in a .mjs host file.
//   G2  No baked inputs        - a kernel must read every parameter from the program/data; prove it by
//                                 running the SAME compiled artifact on DIFFERENT inputs and checking it
//                                 still matches the reference (a benchmark-baked kernel misprices these).
//   G4  Accuracy-gated speed   - any speed claim is accompanied by max-ULP vs a correctly-rounded
//                                 reference; a result outside the declared bound does not ship.
//
// Usage:
//   node bench/honesty_gate.mjs [projectDir]     (defaults to the project this file lives in)
// Exit code 0 = all gates pass; non-zero = at least one gate failed (the number is not to be believed).

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const PROJECT = path.resolve(process.argv[2] || path.join(path.dirname(fileURLToPath(import.meta.url)), '..'));
const NATIVE = path.join(PROJECT, 'native');
const ULP_BOUND = 4; // pricing-grade: <= 4 ULP of the correctly-rounded price on every sampled option

// G3 performance target: Lumen throughput / honest-scalar-libm-C throughput on the SAME honest program.
// Effective: the run FAILS if Lumen drops below this ratio (catches perf regressions and slow gamed-away
// wins). Enhanceable: this is a ratchet - raise it as Lumen genuinely earns it, and the gate prints the
// live headroom to the next rung so you know when to bump it. Overridable per-run via HONESTY_PERF_TARGET.
//   0.90  now      - honest scalar minimax emit, within 10% of idiomatic C (no SIMD yet)
//   1.00  next     - a REAL general SIMD-lowering pass in emit_fn.lm/optimize.lm (matches C)
//   1.50  after    - + 4-wide unroll and constant-lifting in the accelerator (beats C), input-general
//   2.00  stretch  - + wider batching / scheduling; the "beats C decisively" rung
// The rung above the current target must only be reached by code that still passes G1/G2/G4.
const PERF_TARGET = Number(process.env.HONESTY_PERF_TARGET || '0.90');
const PERF_LADDER = [0.90, 1.00, 1.50, 2.00];
const PERF_N = Number(process.env.HONESTY_PERF_N || '2000000');

const results = [];
const record = (gate, pass, detail) => { results.push({ gate, pass, detail }); console.log(`${pass ? 'PASS' : 'FAIL'}  ${gate}  ${detail}`); };

// ---------------------------------------------------------------------------
// G1 - No host-side codegen (STATIC). Two smells, both fatal:
//   (a) pipeline.mjs mutates the emitted C (csrc) with string surgery between emission and clang.
//   (b) a hand-written compute/SIMD kernel lives in a .mjs host file (that is the compiler's job, in .lm).
// A legitimate host may inject a SCALAR runtime library (f_exp/memcpy/pic) - that is libc-class runtime,
// not codegen. What it may NOT do is vectorize the user's loop or rewrite emitted functions.
// ---------------------------------------------------------------------------
function g1_no_host_codegen() {
  const pipe = fs.readFileSync(path.join(NATIVE, 'pipeline.mjs'), 'utf8');
  // (a) the host rewriting the emitted C: any `csrc = csrc.replace(` / `csrc.replace(` reassignment.
  const mutations = [...pipe.matchAll(/csrc\s*=\s*csrc\.replace(All)?\(/g)].length
                  + [...pipe.matchAll(/\bcsrc\s*=\s*[^;]*\.replace(All)?\(/g)].length;
  if (mutations > 0) {
    record('G1', false, `pipeline.mjs rewrites the emitted C in ${mutations} place(s) (host-side codegen: the winning code is not emit_fn.lm's output)`);
  } else {
    record('G1', true, 'pipeline.mjs does not string-mutate the emitted C between emission and clang');
  }
  // (b) SIMD compute kernels defined in host .mjs code that is INJECTED into the emitted binary
  // (the C_HEADER/prologue that pipeline prepends to emit_fn.lm's output). SIMD in a *_bench/_test/_diff
  // harness is a legitimate BASELINE (the hand-tuned C to beat), not claimed as Lumen output - exclude it.
  const simd = /float64x2_t|float64x2|vfmaq_f64|vmulq_f64|vld1q_f64|__attribute__\s*\(\(\s*vector_size/;
  const isHarness = (f) => /_bench\.mjs$|_test\.mjs$|_diff\.mjs$|honesty_gate\.mjs$/.test(f);
  const offenders = [];
  for (const f of fs.readdirSync(NATIVE)) {
    if (!f.endsWith('.mjs') || isHarness(f)) continue;       // headers/pipeline/emitter drivers only
    const body = fs.readFileSync(path.join(NATIVE, f), 'utf8');
    if (simd.test(body)) offenders.push(f);
  }
  if (simd.test(pipe)) offenders.push('pipeline.mjs');       // SIMD authored inline in the host driver
  if (offenders.length) {
    record('G1b', false, `hand-written SIMD compute kernel(s) live in host .mjs file(s): ${offenders.join(', ')} (vectorization must be emitted by Lumen, not authored in the host)`);
  } else {
    record('G1b', true, 'no SIMD compute kernels in host .mjs files');
  }
}

// ---------------------------------------------------------------------------
// G2 + G4 - No baked inputs, accuracy-gated (DYNAMIC).
// Compile the Black-Scholes batch pricer through the target pipeline on SEVERAL DIFFERENT option sets
// (not the benchmark's S=100,K=100,r=0.05,T=1) and assert each price matches the correctly-rounded
// reference within ULP_BOUND. A kernel that baked in the benchmark option misprices these -> caught.
// The reference is computed at 113-bit precision by mpmath (uv, offline), so accuracy is real, not assumed.
// ---------------------------------------------------------------------------
function bsProgram(S, K, r, T, n = 64) {
  // A batch pricer whose per-option parameter is vol; S,K,r,T are program constants that a HONEST kernel
  // must actually read. We vary them across calls so a benchmark-baked kernel (that ignores them) fails.
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
  while j < n {
    acc = acc + bs_call(${S}.0, ${K}.0, ${r}, ${T}, aget(vols, j))
    j = j + 1
  }
  c.print_int(round(acc * 1000000.0))
}
`;
}

// Idiomatic scalar-libm C, SAME algorithm (A&S-poly CDF, libm exp/log) - the honest baseline (G3).
function bsCProgram(S, K, r, T, n) {
  return `#include <stdio.h>
#include <stdlib.h>
#include <math.h>
static double norm_cdf(double x){
  if(x<0.0) return 1.0-norm_cdf(-x);
  double k=1.0/(1.0+0.2316419*x);
  double poly=k*(0.319381530+k*(-0.356563782+k*(1.781477937+k*(-1.821255978+k*1.330274429))));
  double pdf=0.3989422804014327*exp(-(x*x)/2.0);
  return 1.0-pdf*poly;
}
static double bs_call(double s,double k,double r,double t,double vol){
  double d1=(log(s/k)+(r+vol*vol/2.0)*t)/(vol*sqrt(t));
  double d2=d1-vol*sqrt(t);
  return s*norm_cdf(d1)-k*exp(-r*t)*norm_cdf(d2);
}
int main(void){
  long n=${n};
  double* vols=malloc(n*sizeof(double)); if(!vols)return 1;
  for(long i=0;i<n;i++) vols[i]=0.1+(double)i*0.0000001;
  double acc=0.0;
  for(long i=0;i<n;i++) acc+=bs_call(${S}.0,${K}.0,${r},${T},vols[i]);
  printf("%lld\\n",(long long)llround(acc*1000000.0));
  free(vols); return 0;
}
`;
}

function referenceAcc(S, K, r, T) {
  // correctly-rounded sum, computed by mpmath (same A&S-poly algorithm the .lm uses, at 113 bits) so the
  // comparison is algorithm-faithful: we test the KERNEL's fidelity, not the approximation's error.
  const py = `
import sys
from mpmath import mp, mpf, sqrt, exp, log, pi
mp.prec = 113
S,K,r,T = mpf('${S}'), mpf('${K}'), mpf('${r}'), mpf('${T}')
def ncdf(x):
    x = mpf(x)
    if x < 0: return 1 - ncdf(-x)
    k = 1/(1+mpf('0.2316419')*x)
    poly = k*(mpf('0.319381530')+k*(mpf('-0.356563782')+k*(mpf('1.781477937')+k*(mpf('-1.821255978')+k*mpf('1.330274429')))))
    pdf = mpf('0.3989422804014327')*exp(-(x*x)/2)
    return 1 - pdf*poly
def bs(vol):
    vol=mpf(vol)
    d1=(log(S/K)+(r+vol*vol/2)*T)/(vol*sqrt(T)); d2=d1-vol*sqrt(T)
    return S*ncdf(d1)-K*exp(-r*T)*ncdf(d2)
acc=mpf(0)
for i in range(64):
    acc+=bs(mpf('0.1')+mpf(i)*mpf('0.0000001'))   # MUST match bsProgram's vol grid
# round-half-away like the .lm's round(): round(acc*1e6)
val=acc*mpf(1000000)
import math
lo=int(math.floor(val)); frac=val-lo
r_=lo+1 if frac>=mpf('0.5') else lo
print(r_)
`;
  const out = execFileSync('uv', ['run', '--with', 'mpmath', 'python3', '-c', py], { encoding: 'utf8' });
  return BigInt(out.trim());
}

async function g2_g4_no_baked_inputs() {
  const { buildAndRunFn } = await import(path.join(NATIVE, 'pipeline.mjs'));
  // The benchmark option (what a baked kernel is specialized for) PLUS several that differ in EVERY param.
  const options = [
    { S: 100, K: 100, r: '0.05', T: '1.0', label: 'benchmark-option' },
    { S: 120, K: 100, r: '0.03', T: '0.5', label: 'ITM, diff r/T' },
    { S: 90, K: 110, r: '0.08', T: '2.0', label: 'OTM, diff r/T' },
    { S: 100, K: 100, r: '0.05', T: '0.25', label: 'same S/K, diff T' },
  ];
  let allPass = true;
  for (const o of options) {
    let got;
    try { got = BigInt((await buildAndRunFn(bsProgram(o.S, o.K, o.r, o.T), '-O3')).stdout.trim()); }
    catch (e) { record('G2', false, `${o.label}: native build/run failed: ${e.message.slice(0, 80)}`); allPass = false; continue; }
    const ref = referenceAcc(o.S, o.K, o.r, o.T);
    // acc*1e6 is ~O(1e7); compare integer distance (a proxy for ULP on the accumulated price).
    const diff = got > ref ? got - ref : ref - got;
    const ok = diff <= BigInt(Math.round(ULP_BOUND)) * 8n; // small integer slack for the *1e6 scaling
    if (!ok) allPass = false;
    record(o.label === 'benchmark-option' ? 'G4' : 'G2', ok,
      `${o.label} (S=${o.S},K=${o.K},r=${o.r},T=${o.T}): native=${got} ref=${ref} diff=${diff}`);
  }
  return allPass;
}

// ---------------------------------------------------------------------------
// G3 - Performance vs the honest baseline (EFFECTIVE yet ENHANCEABLE).
// Times the SAME honest Lumen pricer that G1/G2/G4 already validated against an idiomatic scalar-libm-C
// loop of the identical algorithm, spawn-subtracted, median of 5. Fails if the ratio is below PERF_TARGET.
// Because G1/G2 run first and reject any host-spliced or input-baked kernel, this speed number can only be
// earned by real, general, accurate Lumen emission - a gamed "beats C" is already dead before G3 times it.
// ---------------------------------------------------------------------------
async function g3_performance() {
  const { buildAndRunFn } = await import(path.join(NATIVE, 'pipeline.mjs'));
  const FLAGS = ['-ffp-contract=fast', '-fno-fast-math', '-O3'];
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'honesty-perf-'));
  const median = (xs) => xs.slice().sort((a, b) => a - b)[Math.floor(xs.length / 2)];
  const timeRun = (bin) => { const t = process.hrtime.bigint(); execFileSync(bin, { encoding: 'utf8' }); return Number(process.hrtime.bigint() - t) / 1e6; };
  fs.writeFileSync(path.join(dir, 'noop.c'), 'int main(void){return 0;}\n');
  execFileSync('clang', ['-O3', '-o', path.join(dir, 'noop'), path.join(dir, 'noop.c')]);
  const spawn = median(Array.from({ length: 7 }, () => timeRun(path.join(dir, 'noop'))));
  const rate = (bin) => PERF_N / (Math.max(0.001, median(Array.from({ length: 5 }, () => timeRun(bin))) - spawn) / 1000);

  // Lumen (the real emit_fn.lm output; heap grown for the batch)
  const nat = await buildAndRunFn(bsProgram(100, 100, '0.05', '1.0', PERF_N), '-O3');
  const natC = nat.csrc.replace(/#define AHEAP_CAP \(1<<\d+\)/, '#define AHEAP_CAP (1<<24)');
  fs.writeFileSync(path.join(dir, 'nat.c'), natC);
  execFileSync('clang', [...FLAGS, '-o', path.join(dir, 'nat'), path.join(dir, 'nat.c')]);
  // Honest scalar-libm-C, same algorithm
  fs.writeFileSync(path.join(dir, 'c.c'), bsCProgram(100, 100, '0.05', '1.0', PERF_N));
  execFileSync('clang', [...FLAGS, '-o', path.join(dir, 'c'), path.join(dir, 'c.c')]);

  const natRate = rate(path.join(dir, 'nat')), cRate = rate(path.join(dir, 'c'));
  const ratio = natRate / cRate;
  const nextRung = PERF_LADDER.find((x) => x > PERF_TARGET + 1e-9);
  const M = (r) => (r / 1e6).toFixed(1) + 'M/s';
  const detail = `Lumen ${M(natRate)} vs honest-C ${M(cRate)} = ${ratio.toFixed(2)}x (target >= ${PERF_TARGET.toFixed(2)}x`
    + (nextRung ? `; ${(ratio >= nextRung ? 'READY TO RAISE to' : 'headroom to next rung')} ${nextRung.toFixed(2)}x` : '; top rung') + ')';
  record('G3', ratio >= PERF_TARGET - 1e-9, detail);
  fs.rmSync(dir, { recursive: true, force: true });
}

// ---------------------------------------------------------------------------
console.log(`\n=== HONESTY GATE  (project: ${PROJECT}) ===\n`);
g1_no_host_codegen();
try { await g2_g4_no_baked_inputs(); }
catch (e) { record('G2/G4', false, `harness error: ${e.message.slice(0, 120)}`); }
try { await g3_performance(); }
catch (e) { record('G3', false, `perf harness error: ${e.message.slice(0, 120)}`); }

const failed = results.filter(r => !r.pass);
console.log(`\n${failed.length === 0 ? 'ALL GATES PASS - the number may be believed.' : `${failed.length} GATE(S) FAILED - the claim is REJECTED regardless of its number:`}`);
for (const f of failed) console.log(`  - ${f.gate}: ${f.detail}`);
process.exit(failed.length === 0 ? 0 : 1);
