// Lumen-mu safety harness: the compiler and interpreter must TERMINATE on every input.
// Regression guard for the parser non-termination + interpreter infinite-loop bugs.
// If a safety fix regresses, this process HANGS and CI's job timeout catches it.
// Usage: node safety.mjs
import fs from 'node:fs';
import wabtInit from 'wabt';

const SRC_BASE = 20000;   // must match lumenc.wat's source region base
const wabt = await wabtInit();
const wat = fs.readFileSync(new URL('./lumenc.wat', import.meta.url), 'utf8');
const binary = wabt.parseWat('lumenc.wat', wat).toBinary({}).buffer;

function fresh() {
  let out = '';
  const holder = {};
  const imports = { lumen: { console_print: (p, l) => { out += Buffer.from(new Uint8Array(holder.inst.exports.mem.buffer, p, l)).toString('utf8'); } } };
  return WebAssembly.instantiate(binary, imports).then(({ instance }) => { holder.inst = instance; return { instance, getOut: () => out }; });
}

function load(instance, src) {
  const b = Buffer.from(src, 'utf8');
  new Uint8Array(instance.exports.mem.buffer, SRC_BASE, b.length).set(b);
  return b.length;
}

let pass = 0, total = 0;
function check(name, cond) { total++; if (cond) { pass++; console.log(`PASS  ${name}`); } else { console.log(`FAIL  ${name}`); } }

// --- Group 1: malformed sources must COMPILE-TERMINATE with a diagnostic, never hang. ---
const malformed = [
  ['unexpected token in block', 'fn main(console: Console) -> Unit {\n  @\n}\n'],
  ['garbage at top level',      '@@@ ### ^^^\n'],
  ['truncated fn',              'fn\n'],
  ['empty source',             ''],
  ['unterminated block',        'fn main(console: Console) -> Unit {\n  let x = 1\n'],
  ['stray operators in body',   'fn main(console: Console) -> Unit {\n  + * / %\n}\n'],
];
for (const [name, src] of malformed) {
  const { instance } = await fresh();
  const len = load(instance, src);
  const ir = instance.exports.compile(len);                 // <-- if the parser regresses, THIS hangs
  const nerr = instance.exports.dbg_nerr();
  // It returned (did not hang). Malformed inputs (except the empty one) should also be diagnosed.
  const terminated = typeof ir === 'number';
  check(`compile terminates: ${name} (ir=${ir}, nerr=${nerr})`, terminated && (src.trim() === '' || nerr > 0));
}

// --- Group 2: an intentionally infinite program must be halted by the fuel cap. ---
{
  const { instance } = await fresh();
  const infinite = 'fn main(console: Console) -> Unit {\n  var i = 0\n  while i == 0 {\n    i = 0\n  }\n}\n';
  const len = load(instance, infinite);
  const ir = instance.exports.compile(len);
  const nerr = instance.exports.dbg_nerr();
  instance.exports.set_fuel_max(200000n);                   // small cap so the test is fast
  instance.exports.run(instance.exports.dbg_main());        // <-- if the fuel limit regresses, THIS hangs
  check(`infinite run halted by fuel cap (compiled ok: ir=${ir}, nerr=${nerr})`, nerr === 0 && typeof ir === 'number');
}

console.log(`\n${pass}/${total} safety checks passed (the compiler and interpreter always terminate).`);
process.exit(pass === total ? 0 : 1);
