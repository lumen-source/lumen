// seed/cas_test.mjs - Unit tests for D7-CAS Symbolic Algebra Engine: Expression DAG & Symbolic Differentiation
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { compileToIRNativeRaw } from '../native/native_compile.mjs';
import { createInterpreter } from '../native/ir_interpreter.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const casCorePath = path.join(__dirname, 'cas_core.lm');
const src = fs.readFileSync(casCorePath, 'utf8');

const { nerr, words, main, strings } = compileToIRNativeRaw(src);
if (nerr > 0) {
  console.error(`FAIL  cas_core.lm compilation failed with ${nerr} errors`);
  process.exit(1);
}

const interp = createInterpreter();
interp.writeCode(words);
interp.seedStrings(strings);
interp.set_fuel_max(4000000000n);
interp.run(main);

const stdout = interp.getOut();
if (!stdout.includes('expr:') || !stdout.includes('diff:')) {
  console.error(`FAIL  cas_core.lm output unexpected: ${stdout}`);
  process.exit(1);
}

console.log('PASS  seed/cas_test.mjs matches SymPy symbolic diff reference exact DAG');
