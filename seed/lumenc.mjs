// lumenc runner: compile a Lumen-mu source file to IR and run it, all in WASM.
// Usage: node lumenc.mjs [path]    (default: ../mu/examples/fib_print.lm; expects "55\n")
import fs from 'node:fs';
import wabtInit from 'wabt';

const SRC_BASE = 100000;
const srcPath = process.argv[2] || new URL('../mu/examples/fib_print.lm', import.meta.url);
const source = fs.readFileSync(srcPath, 'utf8');

const wabt = await wabtInit();
const wat = fs.readFileSync(new URL('./lumenc.wat', import.meta.url), 'utf8');
const mod = wabt.parseWat('lumenc.wat', wat);
const { buffer } = mod.toBinary({});

let out = '';
const { instance } = await WebAssembly.instantiate(buffer, {
  lumen: {
    console_print: (ptr, len) => {
      out += Buffer.from(new Uint8Array(instance.exports.mem.buffer, ptr, len)).toString('utf8');
    },
  },
});

// write source bytes into the compiler's SRC region
const bytes = Buffer.from(source, 'utf8');
new Uint8Array(instance.exports.mem.buffer, SRC_BASE, bytes.length).set(bytes);

instance.exports.compile_and_run(bytes.length);

const expected = '55\n';
console.error(`tokens=${instance.exports.dbg_ntok()} ir_words=${instance.exports.dbg_emit()} main_entry=${instance.exports.dbg_main()}`);
process.stdout.write(out);
if (out === expected) {
  console.error('PASS: compiled fib_print.lm from SOURCE -> IR -> ran => ' + JSON.stringify(out));
  process.exit(0);
} else {
  console.error('FAIL: expected ' + JSON.stringify(expected) + ', got ' + JSON.stringify(out));
  process.exit(1);
}
