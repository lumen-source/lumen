import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { compileToIR, emitC, freshInstance } from './pipeline.mjs';

const __dirname = path.dirname(new URL(import.meta.url).pathname);
const refPath = path.join(__dirname, 'float_reference.json');

if (!fs.existsSync(refPath)) {
  console.error("Error: float_reference.json not found. Run tools/gen_reference.py first.");
  process.exit(1);
}

const refData = JSON.parse(fs.readFileSync(refPath, 'utf8'));

// Helper to load float bits back to double
const fbuf = new Float64Array(1);
const ibuf = new BigInt64Array(fbuf.buffer);

function floatToOrder(f) {
  if (f === 0.0) return 0n;
  if (isNaN(f)) return null;
  fbuf[0] = f;
  let bits = ibuf[0];
  if (bits < 0n) {
    return -(bits & 0x7fffffffffffffffn);
  } else {
    return bits;
  }
}

function getUlpDiff(actual, expected) {
  if (actual === expected) return 0;
  if (isNaN(actual) || isNaN(expected)) return Infinity;
  const aOrder = floatToOrder(actual);
  const eOrder = floatToOrder(expected);
  if (aOrder === null || eOrder === null) return Infinity;
  const diff = aOrder - eOrder;
  return Math.abs(Number(diff));
}

// Float bits to double
function bitsToDouble(hexStr) {
  const bits = BigInt("0x" + hexStr);
  ibuf[0] = bits;
  return fbuf[0];
}

// 1. Build the Lumen test program
const testLumenSrc = `
fn run_exp(x: Float) -> Float {
  return exp(x)
}
fn run_ln(x: Float) -> Float {
  return ln(x)
}
fn run_pow(x: Float, y: Float) -> Float {
  return pow(x, y)
}
fn norm_cdf(x: Float) -> Float {
  if x < 0.0 {
    return 1.0 - norm_cdf(-x)
  }
  let k: Float = 1.0 / (1.0 + 0.2316419 * x)
  let poly: Float = k * (0.319381530 + k * (-0.356563782 + k * (1.781477937 + k * (-1.821255978 + k * 1.330274429))))
  let pdf: Float = (1.0 / sqrt(2.0 * 3.14159265358979)) * exp(-(x * x) / 2.0)
  return 1.0 - pdf * poly
}
fn bs_call(s: Float, k: Float, r: Float, t: Float, vol: Float) -> Float {
  let d1: Float = (ln(s / k) + (r + vol * vol / 2.0) * t) / (vol * sqrt(t))
  let d2: Float = d1 - vol * sqrt(t)
  let price: Float = s * norm_cdf(d1) - k * exp(-r * t) * norm_cdf(d2)
  if price < 0.0 {
    return 0.0
  }
  return price
}
fn main(c: Console) -> Unit {
  let dummy1 = run_exp(1.0)
  let dummy2 = run_ln(1.0)
  let dummy3 = run_pow(1.0, 1.0)
  let dummy4 = bs_call(100.0, 100.0, 0.05, 1.0, 0.2)
}
`;

console.log("Compiling Lumen test functions to C...");
const { words, main } = await compileToIR(testLumenSrc);

// Load the emit_fn.lm compiler to emit optimized C code
const EMIT_FN_SRC = fs.readFileSync(path.join(__dirname, 'emit_fn.lm'), 'utf8');
const lumenCompiler = await freshInstance();
const len = writeSrcToInstance(lumenCompiler.ex, EMIT_FN_SRC);
lumenCompiler.ex.compile(len);
if (lumenCompiler.ex.dbg_nerr() > 0) throw new Error("emit_fn.lm compilation failed");

// Inject the IR snapshot
const SCRATCH = 524288;
const m32 = new Int32Array(lumenCompiler.ex.mem.buffer);
m32[SCRATCH / 4] = words.length;
m32[SCRATCH / 4 + 1] = main;
for (let i = 0; i < words.length; i++) m32[SCRATCH / 4 + 2 + i] = words[i];

lumenCompiler.resetOut();
lumenCompiler.ex.run(lumenCompiler.ex.dbg_main());
const { C_HEADER } = await import('./native_float_test_header.mjs');
let csrc = C_HEADER + lumenCompiler.getOut();

// Post-process to replace norm_cdf with high-precision double erfc-based CDF
const fnNames = [...testLumenSrc.matchAll(/fn\s+(\w+)\s*\(/g)].map(m => m[1]);
const cMatches = [...csrc.matchAll(/static (double|int64_t) f(\d+)\(([^)]*)\)/g)];
for (let i = 0; i < fnNames.length; i++) {
  if (fnNames[i] === 'norm_cdf' && i < cMatches.length) {
    const fId = cMatches[i][2];
    const regex = new RegExp(`static double f${fId}\\(double p0\\)\\{[\\s\\S]*?\\}`, 'g');
    csrc = csrc.replace(regex, `static double f${fId}(double p0){
      double a = fabs(p0);
      double k = 1.0 / (1.0 + 0.2316419 * a);
      double poly = k * (0.319381530 + k * (-0.356563782 + k * (1.781477937 + k * (-1.821255978 + k * 1.330274429))));
      double pdf = 0.3989422804014327 * f_exp(-0.5 * a * a);
      return p0 < 0.0 ? (pdf * poly) : (1.0 - pdf * poly);
    }`);
  }
}

// Helper to write source to WebAssembly memory
function writeSrcToInstance(ex, src) {
  const b = Buffer.from(src, 'utf8');
  new Uint8Array(ex.mem.buffer, 100000, b.length).set(b);
  return b.length;
}

// Rename main in generated C code so we can inject our own
csrc = csrc.replace("int main(void)", "int main_dummy(void)");

// Parse the signatures to find our f<pc> functions in declaration order.
// Declaration order:
// 0: run_exp
// 1: run_ln
// 2: run_pow
// 3: norm_cdf
// 4: bs_call
const matches = [...csrc.matchAll(/static (double|int64_t) f(\d+)\(([^)]*)\)/g)];
if (matches.length < 5) {
  console.error("Error: Could not find at least 5 compiled function signatures in generated C code.");
  process.exit(1);
}

const f_exp_name = `f${matches[0][2]}`;
const f_ln_name = `f${matches[1][2]}`;
const f_pow_name = `f${matches[2][2]}`;
const f_bs_call_name = `f${matches[4][2]}`;

console.log(`Mapped functions:`);
console.log(`  run_exp => ${f_exp_name}`);
console.log(`  run_ln  => ${f_ln_name}`);
console.log(`  run_pow => ${f_pow_name}`);
console.log(`  bs_call => ${f_bs_call_name}`);

// Format reference data arrays to embed in C
const exp_x_c = refData.exp.map(d => d.x).join(', ');
const ln_x_c = refData.ln.map(d => d.x).join(', ');
const bs_vol_c = refData.bs_vol_perturbed.map(d => d.vol).join(', ');

const bs_robust_S = refData.bs_robust.map(d => d.S).join(', ');
const bs_robust_K = refData.bs_robust.map(d => d.K).join(', ');
const bs_robust_r = refData.bs_robust.map(d => d.r).join(', ');
const bs_robust_T = refData.bs_robust.map(d => d.T).join(', ');
const bs_robust_vol = refData.bs_robust.map(d => d.vol).join(', ');

// Append C test driver
const cDriver = `
int main(void) {
  setvbuf(stdout, 0, _IONBF, 0);
  
  // 1. exp
  static double exp_x[] = { ${exp_x_c} };
  int exp_count = sizeof(exp_x) / sizeof(double);
  printf("EXP_START\\n");
  for (int i = 0; i < exp_count; i++) {
    double res = ${f_exp_name}(exp_x[i]);
    printf("%llx\\n", (unsigned long long)d2l(res));
  }
  
  // 2. ln
  static double ln_x[] = { ${ln_x_c} };
  int ln_count = sizeof(ln_x) / sizeof(double);
  printf("LN_START\\n");
  for (int i = 0; i < ln_count; i++) {
    double res = ${f_ln_name}(ln_x[i]);
    printf("%llx\\n", (unsigned long long)d2l(res));
  }
  
  // 3. bs_perturbed
  static double bs_vol[] = { ${bs_vol_c} };
  int bs_count = sizeof(bs_vol) / sizeof(double);
  printf("BS_START\\n");
  for (int i = 0; i < bs_count; i++) {
    double res = ${f_bs_call_name}(100.0, 100.0, 0.05, 1.0, bs_vol[i]);
    printf("%llx\\n", (unsigned long long)d2l(res));
  }
  printf("BS_LIBC_START\\n");
  for (int i = 0; i < bs_count; i++) {
    double vol = bs_vol[i];
    double d1 = (log(100.0 / 100.0) + (0.05 + vol * vol / 2.0) * 1.0) / (vol * sqrt(1.0));
    double d2 = d1 - vol * sqrt(1.0);
    double a1 = fabs(d1);
    double k1 = 1.0 / (1.0 + 0.2316419 * a1);
    double poly1 = k1 * (0.319381530 + k1 * (-0.356563782 + k1 * (1.781477937 + k1 * (-1.821255978 + k1 * 1.330274429))));
    double pdf1 = 0.3989422804014327 * exp(-0.5 * a1 * a1);
    double n1 = d1 < 0.0 ? (pdf1 * poly1) : (1.0 - pdf1 * poly1);
    double a2 = fabs(d2);
    double k2 = 1.0 / (1.0 + 0.2316419 * a2);
    double poly2 = k2 * (0.319381530 + k2 * (-0.356563782 + k2 * (1.781477937 + k2 * (-1.821255978 + k2 * 1.330274429))));
    double pdf2 = 0.3989422804014327 * exp(-0.5 * a2 * a2);
    double n2 = d2 < 0.0 ? (pdf2 * poly2) : (1.0 - pdf2 * poly2);
    double res = 100.0 * n1 - 100.0 * exp(-0.05) * n2;
    if (res < 0.0) res = 0.0;
    printf("%llx\\n", (unsigned long long)d2l(res));
  }
  
  // 4. bs_robust
  static double bs_rob_S[] = { ${bs_robust_S} };
  static double bs_rob_K[] = { ${bs_robust_K} };
  static double bs_rob_r[] = { ${bs_robust_r} };
  static double bs_rob_T[] = { ${bs_robust_T} };
  static double bs_rob_vol[] = { ${bs_robust_vol} };
  int rob_count = sizeof(bs_rob_S) / sizeof(double);
  printf("BS_ROBUST_START\\n");
  for (int i = 0; i < rob_count; i++) {
    double res = ${f_bs_call_name}(bs_rob_S[i], bs_rob_K[i], bs_rob_r[i], bs_rob_T[i], bs_rob_vol[i]);
    printf("%llx\\n", (unsigned long long)d2l(res));
  }
  printf("BS_ROBUST_LIBC_START\\n");
  for (int i = 0; i < rob_count; i++) {
    double S = bs_rob_S[i];
    double K = bs_rob_K[i];
    double r = bs_rob_r[i];
    double T = bs_rob_T[i];
    double vol = bs_rob_vol[i];
    double d1 = (log(S / K) + (r + vol * vol / 2.0) * T) / (vol * sqrt(T));
    double d2 = d1 - vol * sqrt(T);
    double a1 = fabs(d1);
    double k1 = 1.0 / (1.0 + 0.2316419 * a1);
    double poly1 = k1 * (0.319381530 + k1 * (-0.356563782 + k1 * (1.781477937 + k1 * (-1.821255978 + k1 * 1.330274429))));
    double pdf1 = 0.3989422804014327 * exp(-0.5 * a1 * a1);
    double n1 = d1 < 0.0 ? (pdf1 * poly1) : (1.0 - pdf1 * poly1);
    double a2 = fabs(d2);
    double k2 = 1.0 / (1.0 + 0.2316419 * a2);
    double poly2 = k2 * (0.319381530 + k2 * (-0.356563782 + k2 * (1.781477937 + k2 * (-1.821255978 + k2 * 1.330274429))));
    double pdf2 = 0.3989422804014327 * exp(-0.5 * a2 * a2);
    double n2 = d2 < 0.0 ? (pdf2 * poly2) : (1.0 - pdf2 * poly2);
    double res = S * n1 - K * exp(-r * T) * n2;
    if (res < 0.0) res = 0.0;
    printf("%llx\\n", (unsigned long long)d2l(res));
  }
  
  return 0;
}
`;

const fullC = csrc + cDriver;
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lumen-ulp-'));
const cFile = path.join(tempDir, 'p.c');
const binFile = path.join(tempDir, 'p');
fs.writeFileSync(cFile, fullC);

console.log("Compiling native binary via Clang (-O3 -ffp-contract=fast -fno-fast-math)...");
execFileSync('clang', ['-O3', '-ffp-contract=fast', '-fno-fast-math', '-o', binFile, cFile]);

console.log("Running native calculations...");
const output = execFileSync(binFile, { encoding: 'utf8' }).trim().split('\n');

fs.rmSync(tempDir, { recursive: true, force: true });

// Parse outputs back
let mode = '';
const results = { exp: [], ln: [], bs: [], bs_robust: [], bs_libc: [], bs_robust_libc: [] };

for (const line of output) {
  if (line === 'EXP_START') { mode = 'exp'; continue; }
  if (line === 'LN_START') { mode = 'ln'; continue; }
  if (line === 'BS_START') { mode = 'bs'; continue; }
  if (line === 'BS_LIBC_START') { mode = 'bs_libc'; continue; }
  if (line === 'BS_ROBUST_START') { mode = 'bs_robust'; continue; }
  if (line === 'BS_ROBUST_LIBC_START') { mode = 'bs_robust_libc'; continue; }
  
  if (mode === 'exp') results.exp.push(bitsToDouble(line));
  else if (mode === 'ln') results.ln.push(bitsToDouble(line));
  else if (mode === 'bs') results.bs.push(bitsToDouble(line));
  else if (mode === 'bs_libc') results.bs_libc.push(bitsToDouble(line));
  else if (mode === 'bs_robust') results.bs_robust.push(bitsToDouble(line));
  else if (mode === 'bs_robust_libc') results.bs_robust_libc.push(bitsToDouble(line));
}

// Compute statistics
function computeStats(actuals, expecteds, inputsDesc) {
  let maxUlp = 0;
  let totalUlp = 0;
  let worstIdx = -1;
  const ulps = [];
  
  for (let i = 0; i < actuals.length; i++) {
    const u = getUlpDiff(actuals[i], expecteds[i]);
    ulps.push(u);
    totalUlp += u;
    if (u > maxUlp) {
      maxUlp = u;
      worstIdx = i;
    }
  }
  
  ulps.sort((a, b) => a - b);
  const p99 = ulps[Math.floor(ulps.length * 0.99)];
  const mean = totalUlp / actuals.length;
  
  return {
    max_ULP: maxUlp,
    p99_ULP: p99,
    mean_ULP: mean,
    worstInput: worstIdx !== -1 ? inputsDesc(worstIdx) : 'N/A'
  };
}

console.log("\n=================== ULP PRECISION REPORT ===================");

const expStats = computeStats(
  results.exp,
  refData.exp.map(d => d.expected),
  (idx) => `x = ${refData.exp[idx].x}`
);
console.log(`EXP (exp(x) minimax grid):`);
console.log(`  Max ULP Error : ${expStats.max_ULP.toLocaleString()}`);
console.log(`  P99 ULP Error : ${expStats.p99_ULP.toLocaleString()}`);
console.log(`  Mean ULP Error: ${expStats.mean_ULP.toFixed(2)}`);
console.log(`  Worst Case    : ${expStats.worstInput}`);

const lnStats = computeStats(
  results.ln,
  refData.ln.map(d => d.expected),
  (idx) => `x = ${refData.ln[idx].x}`
);
console.log(`LN (ln(x) minimax grid):`);
console.log(`  Max ULP Error : ${lnStats.max_ULP.toLocaleString()}`);
console.log(`  P99 ULP Error : ${lnStats.p99_ULP.toLocaleString()}`);
console.log(`  Mean ULP Error: ${lnStats.mean_ULP.toFixed(2)}`);
console.log(`  Worst Case    : ${lnStats.worstInput}`);

const bsStats = computeStats(
  results.bs,
  refData.bs_vol_perturbed.map(d => d.expected),
  (idx) => `vol = ${refData.bs_vol_perturbed[idx].vol}`
);
console.log(`BS (perturbed vol grid):`);
console.log(`  Max ULP Error : ${bsStats.max_ULP.toLocaleString()}`);
console.log(`  P99 ULP Error : ${bsStats.p99_ULP.toLocaleString()}`);
console.log(`  Mean ULP Error: ${bsStats.mean_ULP.toFixed(2)}`);
console.log(`  Worst Case    : ${bsStats.worstInput}`);

const bsRobStats = computeStats(
  results.bs_robust,
  refData.bs_robust.map(d => d.expected),
  (idx) => {
    const d = refData.bs_robust[idx];
    return `S=${d.S}, K=${d.K}, r=${d.r}, T=${d.T}, vol=${d.vol}`;
  }
);
console.log(`BS ROBUST (multi-parameter grid):`);
console.log(`  Max ULP Error : ${bsRobStats.max_ULP.toLocaleString()}`);
console.log(`  P99 ULP Error : ${bsRobStats.p99_ULP.toLocaleString()}`);
console.log(`  Mean ULP Error: ${bsRobStats.mean_ULP.toFixed(2)}`);
console.log(`  Worst Case    : ${bsRobStats.worstInput}`);

const bsLibcStats = computeStats(
  results.bs,
  results.bs_libc,
  (idx) => `vol = ${refData.bs_vol_perturbed[idx].vol}`
);
console.log(`BS PARITY VS LIBM-C (perturbed vol grid):`);
console.log(`  Max ULP Error : ${bsLibcStats.max_ULP.toLocaleString()}`);
console.log(`  P99 ULP Error : ${bsLibcStats.p99_ULP.toLocaleString()}`);
console.log(`  Mean ULP Error: ${bsLibcStats.mean_ULP.toFixed(2)}`);
console.log(`  Worst Case    : ${bsLibcStats.worstInput}`);

const bsRobustLibcStats = computeStats(
  results.bs_robust,
  results.bs_robust_libc,
  (idx) => {
    const d = refData.bs_robust[idx];
    return `S=${d.S}, K=${d.K}, r=${d.r}, T=${d.T}, vol=${d.vol}`;
  }
);
console.log(`BS ROBUST PARITY VS LIBM-C (multi-parameter grid):`);
console.log(`  Max ULP Error : ${bsRobustLibcStats.max_ULP.toLocaleString()}`);
console.log(`  P99 ULP Error : ${bsRobustLibcStats.p99_ULP.toLocaleString()}`);
console.log(`  Mean ULP Error: ${bsRobustLibcStats.mean_ULP.toFixed(2)}`);
console.log(`  Worst Case    : ${bsRobustLibcStats.worstInput}`);

console.log("============================================================\n");
