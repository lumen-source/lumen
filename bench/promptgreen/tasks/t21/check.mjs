import { createCompiler } from '../../../../seed/compiler_core.mjs';
import fs from 'node:fs';
import { run as hiddenRun } from './hidden_tests.mjs';

const arg = process.argv[2];
const source = fs.readFileSync(arg, 'utf8');
const compiler = await createCompiler();
const compiled = compiler.run(source);
console.log('compile ok:', compiled.ok, 'stdout:', JSON.stringify(compiled.stdout));

const result = await hiddenRun((src) => compiler.run(src), source);
console.log('hidden green:', result.green, JSON.stringify(result.detail));
