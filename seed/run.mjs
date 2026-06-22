// Lumen stage-0 runner: assemble seed.wat, load a Lumen-mu IR program, execute it.
// Usage: node run.mjs            (runs fib, asserts output "55\n")
// The seed is program-agnostic; the program below is fib(10) hand-lowered (see fib.lmir).
import fs from 'node:fs';
import wabtInit from 'wabt';

const CODE_BASE = 11328;   // must match seed.wat
const MAIN_ENTRY = 28;     // word index of `main` in the program below

// fib(10) in Lumen-mu IR bytecode (see fib.lmir for the annotated listing).
const program = [
  2,0, 1,2, 5, 6,10, 2,0, 9,                      // fib: if n<2 return n
  2,0, 1,1, 4, 8,0,1, 2,0, 1,2, 4, 8,0,1, 3, 9,   // else fib(n-1)+fib(n-2)
  1,10, 8,0,1, 10, 0,                             // main: print fib(10); halt
];

const wabt = await wabtInit();
const wat = fs.readFileSync(new URL('./seed.wat', import.meta.url), 'utf8');
const mod = wabt.parseWat('seed.wat', wat);
const { buffer } = mod.toBinary({});

let out = '';
const { instance } = await WebAssembly.instantiate(buffer, {
  lumen: {
    // the single Console capability seam; the only nondeterminism boundary
    console_print: (ptr, len) => {
      const bytes = new Uint8Array(instance.exports.mem.buffer, ptr, len);
      out += Buffer.from(bytes).toString('utf8');
    },
  },
});

// host writes the program into code memory, then runs from main
new Int32Array(instance.exports.mem.buffer, CODE_BASE, program.length).set(program);
instance.exports.run(MAIN_ENTRY);

process.stdout.write(out);
const expected = '55\n';
if (out === expected) {
  console.error('PASS: fib(10) on the Lumen-mu seed => ' + JSON.stringify(out));
  process.exit(0);
} else {
  console.error('FAIL: expected ' + JSON.stringify(expected) + ', got ' + JSON.stringify(out));
  process.exit(1);
}
