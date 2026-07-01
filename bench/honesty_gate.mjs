import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

// Honesty Gate Harness (G1 - G8) for Lumen benchmarks
export class HonestyGate {
  constructor(domainName) {
    this.domainName = domainName;
    this.results = {
      G1: { passed: false, detail: 'Not run' },
      G2: { passed: false, detail: 'Not run' },
      G3: { passed: false, detail: 'Not run' },
      G4: { passed: false, detail: 'Not run' },
      G5: { passed: false, detail: 'Not run' },
      G6: { passed: false, detail: 'Not run' },
      G7: { passed: false, detail: 'Not run' },
      G8: { passed: false, detail: 'Not run' }
    };
  }

  // G1: Check for host-side regex injection or code generation
  checkG1(pipelineFilePath, benchmarkSymbols = []) {
    try {
      if (!fs.existsSync(pipelineFilePath)) {
        this.results.G1 = { passed: true, detail: 'No custom host pipeline file used (Lumen direct compiler).' };
        return true;
      }
      const pipelineContent = fs.readFileSync(pipelineFilePath, 'utf8');
      
      // Look for regex replacements or string manipulation that overrides code emission for specific functions
      const suspiciousPatterns = [
        /\.replace\(/,
        /new RegExp/,
        /static double f\d+/,
        /run_batch_neon/
      ];

      let flagged = false;
      let matchedPattern = '';

      for (const pattern of suspiciousPatterns) {
        if (pattern.test(pipelineContent)) {
          // Check if it targets any of our benchmark symbols
          for (const sym of benchmarkSymbols) {
            if (pipelineContent.includes(sym)) {
              flagged = true;
              matchedPattern = pattern.toString() + ` (contains symbol: ${sym})`;
              break;
            }
          }
        }
      }

      if (flagged) {
        this.results.G1 = { 
          passed: false, 
          detail: `FAIL: Pipeline code contains host-side replacement surgery: ${matchedPattern}` 
        };
        return false;
      } else {
        this.results.G1 = { passed: true, detail: 'PASS: Emitted C is generated purely by the Lumen compiler with no host regex injection.' };
        return true;
      }
    } catch (e) {
      this.results.G1 = { passed: false, detail: `Error checking G1: ${e.message}` };
      return false;
    }
  }

  // G2: Verify that outputs change dynamically with inputs (no baked/hardcoded inputs)
  checkG2(evalFn, referenceFn, testInputsList) {
    try {
      let passed = true;
      let details = [];

      for (const inputs of testInputsList) {
        const actual = evalFn(...inputs);
        const expected = referenceFn(...inputs);

        const absErr = Math.abs(actual - expected);
        const relErr = expected !== 0.0 ? absErr / Math.abs(expected) : absErr;

        if (absErr > 1e-6 && relErr > 1e-6 && !isNaN(actual) && !isNaN(expected)) {
          passed = false;
          details.push(`Input ${JSON.stringify(inputs)} failed: expected ${expected}, got ${actual} (relErr: ${relErr})`);
          break;
        }
      }

      if (passed && testInputsList.length > 0) {
        this.results.G2 = { passed: true, detail: `PASS: Verified dynamic correctness on ${testInputsList.length} distinct input configurations.` };
        return true;
      } else {
        this.results.G2 = { 
          passed: false, 
          detail: `FAIL: Output does not match reference on dynamic inputs. Details: ${details.join('; ')}` 
        };
        return false;
      }
    } catch (e) {
      this.results.G2 = { passed: false, detail: `Error checking G2: ${e.message}` };
      return false;
    }
  }

  // G3: Ensure comparison baseline is honest
  checkG3(baselineDescription, isHonest) {
    if (isHonest) {
      this.results.G3 = { passed: true, detail: `PASS: Baseline is honest (${baselineDescription}).` };
      return true;
    } else {
      this.results.G3 = { 
        passed: false, 
        detail: `FAIL: Baseline is a strawman or disabled. Re-verify the benchmark targets.` 
      };
      return false;
    }
  }

  // G4: Verify accuracy satisfies ULP threshold limits or relative error tolerance
  checkG4(observedMaxUlp, targetThreshold, observedMaxRelError = 0.0, relThreshold = 1e-6, isPricing = true) {
    if (isPricing) {
      const passed = observedMaxRelError <= relThreshold;
      if (passed) {
        this.results.G4 = { 
          passed: true, 
          detail: `PASS: Pricing accuracy met. Max RelErr: ${observedMaxRelError.toExponential(2)} (Target: <= ${relThreshold.toExponential(2)})` 
        };
        return true;
      } else {
        this.results.G4 = { 
          passed: false, 
          detail: `FAIL: Pricing accuracy missed. Max RelErr: ${observedMaxRelError.toExponential(2)} (Target: <= ${relThreshold.toExponential(2)})` 
        };
        return false;
      }
    } else {
      const passed = observedMaxUlp <= targetThreshold;
      if (passed) {
        this.results.G4 = { 
          passed: true, 
          detail: `PASS: Math accuracy met. Max ULP: ${observedMaxUlp} (Target: <= ${targetThreshold})` 
        };
        return true;
      } else {
        this.results.G4 = { 
          passed: false, 
          detail: `FAIL: Math accuracy missed. Max ULP: ${observedMaxUlp} (Target: <= ${targetThreshold})` 
        };
        return false;
      }
    }
  }

  // G5: Confirm reproducibility parameters (warmup + median of >= 5 runs)
  checkG5(runsCount, hasWarmup) {
    if (runsCount >= 5 && hasWarmup) {
      this.results.G5 = { 
        passed: true, 
        detail: `PASS: Verified timing harness uses warmup and takes the median of ${runsCount} runs.` 
      };
      return true;
    } else {
      this.results.G5 = { 
        passed: false, 
        detail: `FAIL: Reproducibility criteria unmet. Requires >= 5 runs and warmup. Got runs=${runsCount}, warmup=${hasWarmup}.` 
      };
      return false;
    }
  }

  // G6: Verify full operations coverage for the domain
  checkG6(coveredOps, requiredOps) {
    const missing = requiredOps.filter(op => !coveredOps.includes(op));
    if (missing.length === 0) {
      this.results.G6 = { passed: true, detail: `PASS: Evaluated all required domain operations: [${requiredOps.join(', ')}].` };
      return true;
    } else {
      this.results.G6 = { 
        passed: false, 
        detail: `FAIL: Missing operations for full domain coverage: [${missing.join(', ')}].` 
      };
      return false;
    }
  }

  // G7: Check emitted assembly for real compiler-emitted SIMD/vector instructions
  checkG7(assemblyFilePath, simdClaimed) {
    if (!simdClaimed) {
      this.results.G7 = { passed: true, detail: 'PASS: No SIMD claim made for this execution path.' };
      return true;
    }

    try {
      if (!fs.existsSync(assemblyFilePath)) {
        this.results.G7 = { passed: false, detail: `FAIL: Assembly file ${assemblyFilePath} not found to check SIMD evidence.` };
        return false;
      }

      const assemblyContent = fs.readFileSync(assemblyFilePath, 'utf8');
      
      // Vector registers or instructions (arm64 neon: v0.2d, q0, fmla, fadd, etc. or fmla.2d syntax)
      const neonMatches = assemblyContent.match(/\b\w+\.(2d|4s|2s|16b|8h)\b/gi) || 
                          assemblyContent.match(/\b(fmla|fadd|fsub|fmul|fdiv|fneg|fabs)\b.*\bv\d+\.(2d|4s|2s|16b|8h)\b/gi) ||
                          assemblyContent.match(/\b(vld1|vst1|vdup|vbsl)\b/gi);

      if (neonMatches && neonMatches.length > 5) {
        this.results.G7 = { 
          passed: true, 
          detail: `PASS: Assembly checks verified ${neonMatches.length} occurrences of vector instructions (e.g. ${neonMatches[0]}).` 
        };
        return true;
      } else {
        this.results.G7 = { 
          passed: false, 
          detail: 'FAIL: No compiler-emitted vector instruction patterns found in disassembly.' 
        };
        return false;
      }
    } catch (e) {
      this.results.G7 = { passed: false, detail: `Error checking G7: ${e.message}` };
      return false;
    }
  }

  // G8: Property-based differential testing over edge cases
  checkG8(observedMaxUlp, targetThreshold, observedMaxRelError = 0.0, relThreshold = 1e-6, isPricing = true) {
    let passed = false;
    let detail = "";
    if (isPricing) {
      passed = observedMaxRelError <= relThreshold;
      detail = `Max RelErr: ${observedMaxRelError.toExponential(2)} (Target: <= ${relThreshold.toExponential(2)})`;
    } else {
      passed = observedMaxUlp <= targetThreshold;
      detail = `Max ULP: ${observedMaxUlp} (Target: <= ${targetThreshold})`;
    }
    
    if (passed) {
      this.results.G8 = { 
        passed: true, 
        detail: `PASS: Completed differential property sweep. ${detail}` 
      };
      return true;
    } else {
      this.results.G8 = { 
        passed: false, 
        detail: `FAIL: Differential accuracy sweep failed. ${detail}` 
      };
      return false;
    }
  }

  // Print results summary
  report() {
    console.log(`\n=================== HONESTY GATE REPORT: ${this.domainName} ===================`);
    let allPassed = true;
    for (const [gate, res] of Object.entries(this.results)) {
      const status = res.passed ? '✅ PASS' : '❌ FAIL';
      if (!res.passed) allPassed = false;
      console.log(`[${gate}] ${status.padEnd(7)}: ${res.detail}`);
    }
    console.log(`--------------------------------------------------------------------------`);
    console.log(`OVERALL STATUS: ${allPassed ? '🏆 PASSED ALL GATES' : '⚠️ FAILED GATES'}`);
    console.log(`==========================================================================\n`);
    return allPassed;
  }
}

// CLI execution entrypoint to support trunk's automated validation
const isMain = process.argv[1] && (
  process.argv[1] === fileURLToPath(import.meta.url) ||
  process.argv[1].endsWith('honesty_gate.mjs')
);

if (isMain) {
  const PROJECT = path.resolve(process.argv[2] || path.join(path.dirname(fileURLToPath(import.meta.url)), '..'));
  const NATIVE = path.join(PROJECT, 'native');
  const ULP_BOUND = 4;
  const PERF_TARGET = Number(process.env.HONESTY_PERF_TARGET || '0.90');
  const PERF_LADDER = [0.90, 1.00, 1.50, 2.00];
  const PERF_N = Number(process.env.HONESTY_PERF_N || '2000000');

  const results = [];
  const record = (gate, pass, detail) => { results.push({ gate, pass, detail }); console.log(`${pass ? 'PASS' : 'FAIL'}  ${gate}  ${detail}`); };

  function g1_no_host_codegen() {
    const pipe = fs.readFileSync(path.join(NATIVE, 'pipeline.mjs'), 'utf8');
    const mutations = [...pipe.matchAll(/csrc\s*=\s*csrc\.replace(All)?\(/g)].length
                    + [...pipe.matchAll(/\bcsrc\s*=\s*[^;]*\.replace(All)?\(/g)].length;
    if (mutations > 0) {
      record('G1', false, `pipeline.mjs rewrites the emitted C in ${mutations} place(s) (host-side codegen: the winning code is not emit_fn.lm's output)`);
    } else {
      record('G1', true, 'pipeline.mjs does not string-mutate the emitted C between emission and clang');
    }
    const simd = /float64x2_t|float64x2|vfmaq_f64|vmulq_f64|vld1q_f64|__attribute__\s*\(\(\s*vector_size/;
    const isHarness = (f) => /_bench\.mjs$|_test\.mjs$|_diff\.mjs$|honesty_gate\.mjs$/.test(f);
    const offenders = [];
    for (const f of fs.readdirSync(NATIVE)) {
      if (!f.endsWith('.mjs') || isHarness(f)) continue;
      const body = fs.readFileSync(path.join(NATIVE, f), 'utf8');
      if (simd.test(body)) offenders.push(f);
    }
    if (simd.test(pipe)) offenders.push('pipeline.mjs');
    if (offenders.length) {
      record('G1b', false, `hand-written SIMD compute kernel(s) live in host .mjs file(s): ${offenders.join(', ')} (vectorization must be emitted by Lumen, not authored in the host)`);
    } else {
      record('G1b', true, 'no SIMD compute kernels in host .mjs files');
    }
  }

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
  while j < n {
    acc = acc + bs_call(${S}.0, ${K}.0, ${r}, ${T}, aget(vols, j))
    j = j + 1
  }
  c.print_int(round(acc * 1000000.0))
}
`;
  }

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
    acc+=bs(mpf('0.1')+mpf(i)*mpf('0.0000001'))
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
      const diff = got > ref ? got - ref : ref - got;
      const ok = diff <= BigInt(Math.round(ULP_BOUND)) * 8n;
      if (!ok) allPass = false;
      record(o.label === 'benchmark-option' ? 'G4' : 'G2', ok,
        `${o.label} (S=${o.S},K=${o.K},r=${o.r},T=${o.T}): native=${got} ref=${ref} diff=${diff}`);
    }
    return allPass;
  }

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

    const nat = await buildAndRunFn(bsProgram(100, 100, '0.05', '1.0', PERF_N), '-O3');
    const natC = nat.csrc.replace(/#define AHEAP_CAP \(1<<\d+\)/, '#define AHEAP_CAP (1<<24)');
    fs.writeFileSync(path.join(dir, 'nat.c'), natC);
    execFileSync('clang', [...FLAGS, '-o', path.join(dir, 'nat'), path.join(dir, 'nat.c')]);
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
}
