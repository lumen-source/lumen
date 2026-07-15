// Regenerate native/emit_fn.bootstrap.c and native/optimize.bootstrap.c - the reproducible,
// wasm-free geneses of the native emitter (lumemit) and optimizer (lumopt). Together with
// native/lumenc.bootstrap.c (R1), these let the ENTIRE native toolchain be built by clang from
// checked-in C with zero wabt / WebAssembly.
//
// Run whenever emit_fn.lm or optimize.lm changes and emitter_bootstrap_test.mjs reports drift.
// Generating them runs the seed once (author-time only); the checked-in artifacts are what the
// wat-free build and the trust chain consume.
import fs from 'node:fs';
import { emitLumemitBootstrapC } from './lumemit_native.mjs';
import { emitLumoptBootstrapC } from './lumopt_native.mjs';

const emitC = await emitLumemitBootstrapC();
fs.writeFileSync(new URL('./emit_fn.bootstrap.c', import.meta.url), emitC);
console.log(`wrote native/emit_fn.bootstrap.c (${(emitC.length / 1024).toFixed(0)} KB)`);

const optC = await emitLumoptBootstrapC();
fs.writeFileSync(new URL('./optimize.bootstrap.c', import.meta.url), optC);
console.log(`wrote native/optimize.bootstrap.c (${(optC.length / 1024).toFixed(0)} KB)`);
