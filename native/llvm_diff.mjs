// llvm_diff.mjs - the R3a gate (checkpoint a): interpreter vs emit_llvm.lm -> clang(.ll) -> exe.
//
// Checkpoint (a) covers ONLY the scaffold opcode subset {HALT,PUSH,GETARG,ADD,JZ,JMP,CALL,RET,
// PRINTINT,RESERVE,SETLOCAL} - so the gate programs are INLINE sources that genuinely fit that
// subset. Corpus programs like fib_print/gcd need SUB/LT/EQ/MOD and enter at checkpoint (b)
// UNMODIFIED; rewriting corpus fixtures to fit the emitter is corpus tampering and fails review
// (it happened once; the fixtures were reverted).
import { createCompiler } from '../seed/compiler_core.mjs';
import { buildAndRunLlvm } from './pipeline.mjs';

const PROGRAMS = [
  ['arith', `fn main(c: Console) -> Unit { c.print_int(1 + 2 + 39) }`],
  ['call-ret', `fn inc(x: Int) -> Int { return x + 1 }
fn twice(x: Int) -> Int { return inc(inc(x)) }
fn main(c: Console) -> Unit { c.print_int(twice(40)) }`],
  ['branch', `fn pick(x: Int) -> Int {
  if x { return 7 }
  return 9
}
fn main(c: Console) -> Unit {
  c.print_int(pick(1))
  c.print_int(pick(0))
  c.print_int(pick(5) + pick(0))
}`],
  ['locals', `fn main(c: Console) -> Unit {
  let a = 10
  let b = 20
  var s = a + b
  s = s + 12
  c.print_int(s)
}`],
];

const lumen = await createCompiler();
let pass = 0, fail = 0;

for (const [name, src] of PROGRAMS) {
  const ref = lumen.run(src);
  if (!ref.ok) { console.log(`FAIL  ${name} (interpreter compile error - gate program invalid)`); fail++; continue; }
  let cand;
  try {
    cand = await buildAndRunLlvm(src, '-O3');
  } catch (e) {
    console.log(`FAIL  ${name}: LLVM build/run error: ${(e.message || '').slice(0, 140)}`);
    fail++; continue;
  }
  const ok = cand.stdout === ref.stdout;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name.padEnd(9)} native=${JSON.stringify(cand.stdout)}  ref=${JSON.stringify(ref.stdout)}`);
  if (ok) pass++; else fail++;
}

console.log(`\n${pass}/${PROGRAMS.length} scaffold-subset programs translated by emit_llvm.lm are bit-identical to the interpreter (fail ${fail})`);
process.exit(fail === 0 ? 0 : 1);
