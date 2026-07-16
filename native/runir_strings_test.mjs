// runir_strings_test.mjs - regression: runIR() must accept a strings sidecar so callers that
// interpret optimizer output (the forge fuzzer's OPT path, see forge/forge.mjs path c) don't
// read an unseeded literal heap on Text-producing programs.
//
// Bug: pipeline.mjs's runIR(words, main) never seeded the interpreter's compile-time string
// heap (interp.seedStrings(...), the same call freshInstance()'s compile() and forge.mjs's
// runInterp() already make before running). Any program that uses a Text literal, text_concat,
// or int_to_text and flows through optimizeIR() -> runIR() with no recompile in between (the
// optimizer's output IR keeps the SAME literal pointers - see native_compile.mjs's comment on
// runIRNative) prints garbage/empty output instead of the real string.
// forge_corpus/pending/OPT_DIFF-seed5.lm is a live genprog repro of exactly this
// (console.print("val") -> opt stdout "" vs ref stdout "val").
import fs from 'node:fs';
import { compileToIRNative, optimizeIRNative } from './native_compile.mjs';
import { runIR, buildAndRunFn } from './pipeline.mjs';

const src = fs.readFileSync(new URL('../mu/examples/greet.lm', import.meta.url), 'utf8');

// oracle: compile -> emit C -> clang -> run. Entirely independent of runIR/optimizeIR.
const oracle = await buildAndRunFn(src);

const { words, main, strings } = compileToIRNative(src);
const opt = optimizeIRNative(words, main);
const optOut = await runIR(opt.words, opt.main, strings);

let pass = 0, fail = 0;
function check(name, ok) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`);
  if (ok) pass++; else fail++;
}

check('oracle produced the expected greeting', oracle.stdout === 'hi there\n');
check('runIR(words, main, strings) after optimizeIR matches the compile-and-run oracle',
  optOut === oracle.stdout);

console.log(`${pass}/${pass + fail} runir_strings_test checks passed`);
process.exit(fail === 0 ? 0 : 1);
