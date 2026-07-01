// build.mjs - ahead-of-time compiler driver for Lumen to produce standalone executables
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { compileToIR, optimizeIR, freshInstance, writeSrc } from './pipeline.mjs';

const SCRATCH = 524288;
const SRC_BASE = 100000;

function printUsageAndExit() {
  console.error("Usage: node build.mjs <input.lm> -o <output-exe> [--opt -O2|-O3] [--fast]");
  process.exit(1);
}

// Argument parsing
const args = process.argv.slice(2);
if (args.length === 0) {
  printUsageAndExit();
}

let inputPath = null;
let outputPath = null;
let optLevel = '-O2';
let fast = false;

for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  if (arg === '-o') {
    if (i + 1 >= args.length) {
      console.error("Error: -o option requires an argument");
      printUsageAndExit();
    }
    outputPath = args[++i];
  } else if (arg === '--opt') {
    if (i + 1 >= args.length) {
      console.error("Error: --opt option requires an argument (-O2 or -O3)");
      printUsageAndExit();
    }
    optLevel = args[++i];
    if (optLevel !== '-O2' && optLevel !== '-O3') {
      console.error(`Error: invalid optimization level ${optLevel}, must be -O2 or -O3`);
      printUsageAndExit();
    }
  } else if (arg === '--fast') {
    fast = true;
  } else if (arg.startsWith('-')) {
    console.error(`Error: unknown option ${arg}`);
    printUsageAndExit();
  } else {
    if (inputPath !== null) {
      console.error(`Error: multiple input files specified (${inputPath} and ${arg})`);
      printUsageAndExit();
    }
    inputPath = arg;
  }
}

if (!inputPath) {
  console.error("Error: no input file specified");
  printUsageAndExit();
}

if (!outputPath) {
  outputPath = path.basename(inputPath, '.lm');
}

if (fast) {
  console.log("Warning: --fast option enabled. Bit-reproducibility vs the interpreter is voided.");
}

async function emitWith(emitterSrc, words, main, strings = []) {
  const I = await freshInstance();
  const len = writeSrc(I, emitterSrc);
  I.ex.compile(len);
  if (I.ex.dbg_nerr() > 0) throw new Error(`emitter compile: ${I.ex.dbg_nerr()} error(s)`);
  const m32 = new Int32Array(I.ex.mem.buffer);
  m32[SCRATCH / 4] = words.length;
  m32[SCRATCH / 4 + 1] = main;
  for (let i = 0; i < words.length; i++) m32[SCRATCH / 4 + 2 + i] = words[i];

  // Inject the strings sidecar
  const offset_words = 2 + words.length;
  const dir_word_count = 3 * strings.length;
  m32[SCRATCH / 4 + offset_words] = dir_word_count;

  let current_byte_offset = SCRATCH + (offset_words + 1 + dir_word_count) * 4;

  for (let i = 0; i < strings.length; i++) {
    const s = strings[i];
    const triple_idx = SCRATCH / 4 + offset_words + 1 + 3 * i;
    m32[triple_idx] = s.ptr;
    m32[triple_idx + 1] = s.len;
    m32[triple_idx + 2] = current_byte_offset;

    // Copy bytes to current_byte_offset
    const m8 = new Uint8Array(I.ex.mem.buffer);
    m8.set(s.bytes, current_byte_offset);

    current_byte_offset += s.len;
  }

  if (current_byte_offset > 589824) {
    throw new Error(`IR + sidecar exceed Page-9 capacity (size ${current_byte_offset - SCRATCH}B exceeds 65536B)`);
  }

  I.resetOut();
  if (I.ex.set_fuel_max) I.ex.set_fuel_max(4000000000n);
  I.ex.run(I.ex.dbg_main());
  const { C_HEADER } = await import('./native_float_test_header.mjs');
  const RUNTIME = `
static int64_t lm_alloc_bytes(int64_t num_bytes) {
  int64_t words = (num_bytes + 7) / 8;
  if (AHP + words > AHEAP_CAP) { fflush(stdout); exit(0); }
  int64_t h = AHP;
  for (int64_t i = 0; i < words; i++) AHEAP[h + i] = 0;
  AHP += words;
  return (int64_t)&AHEAP[h];
}
static int64_t lm_alloc_sum(int64_t tag, int64_t payload) {
  if (AHP + 2 > AHEAP_CAP) { fflush(stdout); exit(0); }
  int64_t h = AHP;
  AHEAP[h] = tag;
  AHEAP[h+1] = payload;
  AHP += 2;
  return (int64_t)&AHEAP[h];
}
static int64_t lm_concat(int64_t pa, int64_t pb) {
  int32_t la = *(int32_t*)pa;
  int32_t lb = *(int32_t*)pb;
  int64_t ptr = lm_alloc_bytes(4 + la + lb);
  *(int32_t*)ptr = la + lb;
  memcpy((char*)ptr + 4, (char*)pa + 4, la);
  memcpy((char*)ptr + 4 + la, (char*)pb + 4, lb);
  return ptr;
}
static int64_t lm_int2text(int64_t val_s) {
  uint64_t v = (uint64_t)val_s;
  int32_t neg = 0;
  if (val_s < 0) {
    neg = 1;
    v = 0 - v;
  }
  int32_t nd = 1;
  uint64_t tmp = v;
  while (1) {
    tmp = tmp / 10;
    if (tmp == 0) break;
    nd++;
  }
  int32_t len = nd + neg;
  int64_t ptr = lm_alloc_bytes(4 + len);
  *(int32_t*)ptr = len;
  char* w = (char*)ptr + 4 + len;
  uint64_t curr = v;
  while (1) {
    w--;
    *w = (char)(48 + (curr % 10));
    curr = curr / 10;
    if (curr == 0) break;
  }
  if (neg) {
    *((char*)ptr + 4) = '-';
  }
  return ptr;
}
static int64_t lm_texteq(int64_t pa, int64_t pb) {
  if (pa == pb) return 1;
  if (!pa || !pb) return 0;
  int32_t la = *(int32_t*)pa;
  int32_t lb = *(int32_t*)pb;
  if (la != lb) return 0;
  return memcmp((char*)pa + 4, (char*)pb + 4, la) == 0 ? 1 : 0;
}
static void lm_printtext(int64_t a) {
  if (!a) return;
  int32_t len = *(int32_t*)a;
  fwrite((char*)a + 4, 1, len, stdout);
}
`;
  return C_HEADER + RUNTIME + I.getOut();
}

async function main() {
  let src;
  try {
    src = fs.readFileSync(inputPath, 'utf8');
  } catch (e) {
    console.error(`Error reading input file: ${e.message}`);
    process.exit(1);
  }

  // compileToIR
  let ir;
  try {
    ir = await compileToIR(src);
  } catch (e) {
    // Re-run compilation to access diagnostics
    const I = await freshInstance();
    const len = writeSrc(I, src);
    I.ex.compile(len);
    const nerr = I.ex.dbg_nerr();
    const m32 = new Int32Array(I.ex.mem.buffer);
    for (let i = 0; i < Math.min(10, nerr); i++) {
      const dbase = 286000 + i * 12;
      const code = m32[dbase / 4];
      const off = m32[dbase / 4 + 1];
      const elen = m32[dbase / 4 + 2];
      const tstr = Buffer.from(I.ex.mem.buffer, off, elen).toString();
      console.error(`Error code ${code} at '${tstr}' (byte ${off - SRC_BASE})`);
    }
    process.exit(1);
  }

  // optimizeIR
  let optimized;
  try {
    optimized = await optimizeIR(ir.words, ir.main);
  } catch (e) {
    console.error(`Error during optimization: ${e.message}`);
    process.exit(1);
  }

  const { words, main: irMain } = optimized;

  // Find all MKTEXT operands in the optimized words
  const ptrs = [];
  let pc = 0;
  while (pc < words.length) {
    const op = words[pc];
    if (op === 57) {
      pc = pc + 3 + words[pc + 1];
    } else {
      if (op === 15) {
        ptrs.push(words[pc + 1]);
      }
      let oplen = 0;
      if (op === 1 || op === 2 || op === 6 || op === 7 || op === 13 || op === 14 || op === 15 || op === 25) {
        oplen = 1;
      } else if (op === 8 || op === 29) {
        oplen = 2;
      }
      pc = pc + 1 + oplen;
    }
  }
  const uniquePtrs = [...new Set(ptrs)];
  const stringsMap = new Map(ir.strings.map(s => [s.ptr, s]));
  const strings = uniquePtrs.map(ptr => {
    const s = stringsMap.get(ptr);
    if (!s) throw new Error(`Internal error: string pointer ${ptr} not found in compile-time strings`);
    return s;
  });

  const EMIT_FN_SRC = fs.readFileSync(new URL('./emit_fn.lm', import.meta.url), 'utf8');
  let csrc;
  try {
    csrc = await emitWith(EMIT_FN_SRC, words, irMain, strings);
  } catch (e) {
    console.error(`Error during C emission: ${e.message}`);
    process.exit(1);
  }

  // Write C source to a temp file and compile using clang
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lumen-build-'));
  const cfile = path.join(dir, 'p.c');
  fs.writeFileSync(cfile, csrc);

  const clangFlags = [];
  if (fast) {
    clangFlags.push('-ffp-contract=fast', '-ffast-math');
  } else {
    clangFlags.push('-ffp-contract=off', '-fno-fast-math');
  }
  clangFlags.push(optLevel, '-o', outputPath, cfile);

  try {
    execFileSync('clang', clangFlags, { stdio: ['ignore', 'ignore', 'pipe'] });
  } catch (e) {
    console.error(`clang failed: ${String(e.stderr || e.message).slice(0, 300)}`);
    process.exit(1);
  } finally {
    // Clean up temporary files
    try {
      fs.unlinkSync(cfile);
      fs.rmdirSync(dir);
    } catch (_) {}
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
