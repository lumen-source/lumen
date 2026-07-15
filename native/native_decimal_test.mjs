// native_decimal_test.mjs - gate for emit_fn.lm's Dec lowering (ops 64-70, D2).
//
// Pattern: the native_diff.mjs pattern (ref = interpret(compile(src)), cand =
// run(clang(emit_fn.lm(compile(src)))), assert cand.stdout === ref.stdout byte-for-byte,
// zero tolerance) plus a golden-stdout cross-check wherever this file already has an
// independently-verified value (from D1's Python integer-math oracle, not derived from
// either compiler), so a shared bug in both the interpreter oracle AND the C lowering
// cannot silently agree with itself.
//
// Trap cases (overflow, dec_div by zero) assert three things, not just stdout equality:
// the printed PREFIX matches on both sides, the interpreter actually crashed
// (ref.crash is set), and the native binary actually exited non-zero (cand.exit !== 0).
// Two independently-implemented traps producing the same truncated (empty) stdout by
// coincidence, with neither side actually trapping, would otherwise pass a stdout-only
// check silently - this file does not allow that.
import fs from 'node:fs';
import { createCompiler } from '../seed/compiler_core.mjs';
import { buildAndRunFn } from './pipeline.mjs';

const lumen = await createCompiler();

// ---- functional corpus: golden values independently verified in D1 (Python integer-math
// oracle: round-half-even on exact integers, not decimal.Decimal, not derived from either
// compiler under test here) ----
const CORPUS = [
  { name: 'exact 0.1+0.2==0.3',            src: 'fn main(c: Console) -> Unit {\n  c.print_int(0.1d + 0.2d == 0.3d)\n}\n', gold: '1\n' },
  { name: 'exact sum prints 0.3 exactly',  src: 'fn main(c: Console) -> Unit {\n  c.print(dec_to_text(0.1d + 0.2d))\n}\n', gold: '0.3' },
  { name: 'literal 1.50d',                 src: 'fn main(c: Console) -> Unit {\n  c.print(dec_to_text(1.50d))\n}\n', gold: '1.5' },
  { name: 'literal -3d',                   src: 'fn main(c: Console) -> Unit {\n  c.print(dec_to_text(-3d))\n}\n', gold: '-3.0' },
  { name: 'literal 0.000001d',             src: 'fn main(c: Console) -> Unit {\n  c.print(dec_to_text(0.000001d))\n}\n', gold: '0.000001' },
  { name: 'literal max safe whole number', src: 'fn main(c: Console) -> Unit {\n  c.print(dec_to_text(9223372036854d))\n}\n', gold: '9223372036854.0' },
  { name: 'exact add',                     src: 'fn main(c: Console) -> Unit {\n  c.print(dec_to_text(1.25d + 2.50d))\n}\n', gold: '3.75' },
  { name: 'exact sub',                     src: 'fn main(c: Console) -> Unit {\n  c.print(dec_to_text(5.00d - 1.25d))\n}\n', gold: '3.75' },
  { name: 'sub goes negative',             src: 'fn main(c: Console) -> Unit {\n  c.print(dec_to_text(1.25d - 5.00d))\n}\n', gold: '-3.75' },
  { name: 'unary minus',                   src: 'fn main(c: Console) -> Unit {\n  c.print(dec_to_text(-(1.50d)))\n}\n', gold: '-1.5' },
  { name: 'unary minus of a micro-unit',   src: 'fn main(c: Console) -> Unit {\n  c.print(dec_to_text(-(0.000001d)))\n}\n', gold: '-0.000001' },
  { name: 'mul simple',                    src: 'fn main(c: Console) -> Unit {\n  c.print(dec_to_text(2.00d * 3.50d))\n}\n', gold: '7.0' },
  { name: 'mul half-even tie: already even, no change', src: 'fn main(c: Console) -> Unit {\n  c.print(dec_to_text(0.5d * 1.000001d))\n}\n', gold: '0.5' },
  { name: 'mul half-even tie: odd, rounds up to even',  src: 'fn main(c: Console) -> Unit {\n  c.print(dec_to_text(0.5d * 1.000003d))\n}\n', gold: '0.500002' },
  { name: 'mul negative * positive',       src: 'fn main(c: Console) -> Unit {\n  c.print(dec_to_text(-2.00d * 3.50d))\n}\n', gold: '-7.0' },
  { name: 'mul negative * negative',       src: 'fn main(c: Console) -> Unit {\n  c.print(dec_to_text(-2.00d * -3.50d))\n}\n', gold: '7.0' },
  { name: 'dec_div simple',                src: 'fn main(c: Console) -> Unit {\n  c.print(dec_to_text(dec_div(1.00d, 4)))\n}\n', gold: '0.25' },
  { name: 'dec_div negative dividend',     src: 'fn main(c: Console) -> Unit {\n  c.print(dec_to_text(dec_div(-1.00d, 4)))\n}\n', gold: '-0.25' },
  { name: 'dec_div negative divisor',      src: 'fn main(c: Console) -> Unit {\n  c.print(dec_to_text(dec_div(1.00d, -4d)))\n}\n', gold: '-0.25' },
  { name: 'dec_div repeating decimal rounds at 6dp', src: 'fn main(c: Console) -> Unit {\n  c.print(dec_to_text(dec_div(10.00d, 3)))\n}\n', gold: '3.333333' },
  { name: 'dec_div half-even tie',         src: 'fn main(c: Console) -> Unit {\n  c.print(dec_to_text(dec_div(1d, 0.008192d)))\n}\n', gold: '122.070312' },
  { name: 'int + dec coerces lhs',         src: 'fn main(c: Console) -> Unit {\n  c.print(dec_to_text(3 + 19.99d))\n}\n', gold: '22.99' },
  { name: 'dec + int coerces rhs',         src: 'fn main(c: Console) -> Unit {\n  c.print(dec_to_text(19.99d + 3))\n}\n', gold: '22.99' },
  { name: 'int - dec coerces lhs',         src: 'fn main(c: Console) -> Unit {\n  c.print(dec_to_text(100 - 1.50d))\n}\n', gold: '98.5' },
  { name: 'int * dec coerces lhs',         src: 'fn main(c: Console) -> Unit {\n  c.print(dec_to_text(2 * 19.99d))\n}\n', gold: '39.98' },
  { name: 'dec_to_text of a bare Int coerces', src: 'fn main(c: Console) -> Unit {\n  c.print(dec_to_text(5))\n}\n', gold: '5.0' },
  { name: 'comparison lt',                 src: 'fn main(c: Console) -> Unit {\n  c.print_int(1.5d < 2.0d)\n}\n', gold: '1\n' },
  { name: 'comparison eq different literal form', src: 'fn main(c: Console) -> Unit {\n  c.print_int(1.5d == 1.500000d)\n}\n', gold: '1\n' },
  { name: 'comparison int-coerced',        src: 'fn main(c: Console) -> Unit {\n  c.print_int(3 < 3.5d)\n}\n', gold: '1\n' },
  { name: 'dec_to_float roundtrip',        src: 'fn main(c: Console) -> Unit {\n  c.print_int(to_int(dec_to_float(1.50d) * 100.0))\n}\n', gold: '150\n' },
  { name: 'dec param and return, composed with dec_div', src:
    'fn account_value(principal: Dec, rate: Dec) -> Dec { return principal + dec_div(principal * rate, 100) }\n' +
    'fn main(c: Console) -> Unit { c.print(dec_to_text(account_value(1000.00d, 5.00d))) }\n', gold: '1050.0' },
];

// ---- trap corpus: DADD/DSUB/DMUL/DFROMI overflow, dec_div by zero. Each prints a known
// prefix, then triggers the trap, then (if it somehow did NOT trap) would print a second
// marker - so a silent non-trap is a visible stdout mismatch, not just a missing crash flag.
const TRAPS = [
  { name: 'add overflow traps',            src: 'fn main(c: Console) -> Unit {\n  c.print_int(0)\n  let x = 9223372036854d + 1d\n  c.print_int(1)\n}\n' },
  { name: 'sub overflow traps (negative side)', src: 'fn main(c: Console) -> Unit {\n  c.print_int(0)\n  let x = -9223372036854d - 1d\n  c.print_int(1)\n}\n' },
  { name: 'mul overflow traps',            src: 'fn main(c: Console) -> Unit {\n  c.print_int(0)\n  let x = 9223372036854d * 2d\n  c.print_int(1)\n}\n' },
  // built via multiplication, not a raw literal: the seed's Int lexer accumulates into an
  // i32 (a pre-existing, D1-documented limit unrelated to Dec), so a bare 13-digit literal
  // would silently wrap before DFROMI ever sees it.
  { name: 'int coercion to dec overflow traps (DFROMI)', src: 'fn main(c: Console) -> Unit {\n  c.print_int(0)\n  let big = 1000000000 * 10000\n  let x = big + 1.00d\n  c.print_int(1)\n}\n' },
  { name: 'dec_div by zero traps',         src: 'fn main(c: Console) -> Unit {\n  c.print_int(0)\n  let x = dec_div(1.00d, 0)\n  c.print_int(1)\n}\n' },
];

let pass = 0, fail = 0;

console.log('== functional corpus: golden == interpreter == native, byte-for-byte ==');
for (const t of CORPUS) {
  const ref = lumen.run(t.src);
  if (!ref.ok) { console.log(`FAIL  ${t.name}: interpreter rejected the source (should compile clean)`); fail++; continue; }
  let cand;
  try { cand = await buildAndRunFn(t.src); }
  catch (e) { console.log(`FAIL  ${t.name}: native build/run error: ${e.message.slice(0, 160)}`); fail++; continue; }
  const ok = cand.stdout === ref.stdout && ref.stdout === t.gold;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${t.name.padEnd(46)} native=${JSON.stringify(cand.stdout)} ref=${JSON.stringify(ref.stdout)} gold=${JSON.stringify(t.gold)}`);
  if (ok) pass++; else fail++;
}

console.log('\n== flagship: mu/examples/decimal.lm ==');
{
  const src = fs.readFileSync(new URL('../mu/examples/decimal.lm', import.meta.url), 'utf8');
  const ref = lumen.run(src);
  if (!ref.ok) { console.log('FAIL  decimal.lm: interpreter rejected the source'); fail++; }
  else {
    let cand;
    try { cand = await buildAndRunFn(src); }
    catch (e) { console.log(`FAIL  decimal.lm: native build/run error: ${e.message.slice(0, 200)}`); fail++; cand = null; }
    if (cand) {
      const ok = cand.stdout === ref.stdout;
      console.log(`${ok ? 'PASS' : 'FAIL'}  decimal.lm  native==ref: ${ok}`);
      if (!ok) { console.log(`  native: ${JSON.stringify(cand.stdout)}`); console.log(`  ref:    ${JSON.stringify(ref.stdout)}`); }
      if (ok) pass++; else fail++;
    }
  }
}

console.log('\n== trap corpus: overflow / div-by-zero (prefix matches, interpreter crashed, native exited non-zero) ==');
for (const t of TRAPS) {
  const ref = lumen.run(t.src);
  let cand;
  try { cand = await buildAndRunFn(t.src); }
  catch (e) { console.log(`FAIL  ${t.name}: native build/run error: ${e.message.slice(0, 160)}`); fail++; continue; }
  const refTrapped = Boolean(ref.crash);
  const candTrapped = cand.exit !== 0;
  const prefixOk = cand.stdout === ref.stdout && ref.stdout === '0\n';
  const ok = refTrapped && candTrapped && prefixOk;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${t.name.padEnd(46)} native_exit=${cand.exit} native_stdout=${JSON.stringify(cand.stdout)} ref_crash=${JSON.stringify(ref.crash)} ref_stdout=${JSON.stringify(ref.stdout)}`);
  if (ok) pass++; else fail++;
}

const total = CORPUS.length + 1 + TRAPS.length;
console.log(`\n${pass}/${total} decimal programs: golden==interpreter==native, traps verified on both sides (fail ${fail})`);
process.exit(fail === 0 ? 0 : 1);
