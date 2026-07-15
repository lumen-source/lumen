// Emitter + optimizer bootstrap gate (R4). Completes the R1 genesis story: with
// native/lumenc.bootstrap.c (compiler, R1) plus native/emit_fn.bootstrap.c (emitter) and
// native/optimize.bootstrap.c (optimizer), the WHOLE native toolchain is `clang <checked-in C>`
// with zero wabt / WebAssembly. This is the prerequisite for retiring the wat (R5): without it,
// the native emit/optimize stages still had to be built via the wat once at setup.
//
// For each of {emitter, optimizer} this proves two things, exactly as R1's bootstrap_test does:
//   (1) Rot guard: re-emitting the bootstrap C reproduces the checked-in file byte-for-byte, so
//       it cannot drift from emit_fn.lm / optimize.lm (regenerate via build_emitter_bootstrap.mjs).
//   (2) Genesis reproduces the binary: clang-ing the checked-in C yields a native binary whose
//       output on real IR is byte-identical to the wasm-path build. The test IR is produced by
//       the NATIVE compiler (compileToIRNative, zero wasm), so the only wasm here is the one-time
//       reference build (buildLumemitNative/buildLumoptNative), same as R1.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { emitLumemitBootstrapC, buildLumemitNative, runLumemitNative } from './lumemit_native.mjs';
import { emitLumoptBootstrapC, buildLumoptNative, runLumoptNative } from './lumopt_native.mjs';
import { compileToIRNative } from './native_compile.mjs';

let pass = true;
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'emitter-bootstrap-gate-'));
function clangBootstrap(file, name) {
  const bin = path.join(dir, name);
  execFileSync('clang', ['-ffp-contract=off', '-fno-fast-math', '-O2', '-o', bin, file]);
  return bin;
}

// --- EMITTER ---
{
  const checkedIn = fs.readFileSync(new URL('./emit_fn.bootstrap.c', import.meta.url), 'utf8');
  const reemit = await emitLumemitBootstrapC();
  if (reemit === checkedIn) console.log('PASS  re-emit matches checked-in native/emit_fn.bootstrap.c');
  else { console.log('FAIL  native/emit_fn.bootstrap.c is stale; run `node build_emitter_bootstrap.mjs`'); pass = false; }

  const bootBin = clangBootstrap(new URL('./emit_fn.bootstrap.c', import.meta.url).pathname, 'lumemit0');
  const wasmBin = (await buildLumemitNative()).bin;
  const prog = fs.readFileSync(new URL('../examples/finance/black_scholes.lm', import.meta.url), 'utf8');
  const { words, main, strings } = await compileToIRNative(prog);
  const cBoot = runLumemitNative(bootBin, words, main, strings);
  const cWasm = runLumemitNative(wasmBin, words, main, strings);
  if (cBoot === cWasm) console.log(`PASS  clang(emit_fn.bootstrap.c) reproduces the native emitter byte-for-byte (${cBoot.length} bytes C, zero wasm)`);
  else { console.log('FAIL  bootstrap emitter output differs from the wasm-path build'); pass = false; }
}

// --- OPTIMIZER (fed lumenc.lm, which exercises real jump-threading / folding) ---
{
  const checkedIn = fs.readFileSync(new URL('./optimize.bootstrap.c', import.meta.url), 'utf8');
  const reemit = await emitLumoptBootstrapC();
  if (reemit === checkedIn) console.log('PASS  re-emit matches checked-in native/optimize.bootstrap.c');
  else { console.log('FAIL  native/optimize.bootstrap.c is stale; run `node build_emitter_bootstrap.mjs`'); pass = false; }

  const bootBin = clangBootstrap(new URL('./optimize.bootstrap.c', import.meta.url).pathname, 'lumopt0');
  const wasmBin = (await buildLumoptNative()).bin;
  const prog = fs.readFileSync(new URL('../seed/lumenc.lm', import.meta.url), 'utf8');
  const { words, main } = await compileToIRNative(prog);
  const oBoot = runLumoptNative(bootBin, words, main);
  const oWasm = runLumoptNative(wasmBin, words, main);
  const same = oBoot.main === oWasm.main && oBoot.threaded === oWasm.threaded && oBoot.folded === oWasm.folded
    && oBoot.words.length === oWasm.words.length && oBoot.words.every((w, i) => w === oWasm.words[i]);
  if (same) console.log(`PASS  clang(optimize.bootstrap.c) reproduces the native optimizer byte-for-byte (${oBoot.words.length} words, threaded ${oBoot.threaded}, folded ${oBoot.folded}, zero wasm)`);
  else { console.log('FAIL  bootstrap optimizer output differs from the wasm-path build'); pass = false; }
}

console.log(pass ? '\nemitter+optimizer bootstrap gate: PASS' : '\nemitter+optimizer bootstrap gate: FAIL');
process.exit(pass ? 0 : 1);
