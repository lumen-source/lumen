#!/usr/bin/env node
// Selftest for the promptgreen rig itself (not a real prompt-to-green measurement). Runs the
// deterministic scripted author over all 10 frozen tasks and asserts:
//   1. the measured rounds-to-green vector EXACTLY equals the scripted expectation
//   2. every task's hidden tests go green
//   3. the JSONL log is well-formed (one line per attempt, required keys, correct types)
// Exit 0 on success, 1 on any assertion failure (with a diagnostic printed to stderr).

import { createCompiler } from '../../seed/compiler_core.mjs';
import { listTaskIds, loadTask, runTask, jsonlText } from './runner.mjs';
import { makeScriptedAuthor, EXPECTED_ROUNDS } from './scripted_author.mjs';

const REQUIRED_KEYS = ['task', 'round', 'chars_in', 'chars_out', 'diag_codes', 'green_compile', 'green_solved'];

function assert(cond, msg) {
  if (!cond) throw new Error('SELFTEST FAILED: ' + msg);
}

async function main() {
  const compiler = await createCompiler();
  const taskIds = listTaskIds();
  assert(taskIds.length === 10, `expected 10 tasks, found ${taskIds.length}: ${taskIds.join(',')}`);
  assert(
    JSON.stringify(taskIds) === JSON.stringify(Object.keys(EXPECTED_ROUNDS).sort()),
    `task set mismatch: tasks=${JSON.stringify(taskIds)} expected_rounds=${JSON.stringify(Object.keys(EXPECTED_ROUNDS).sort())}`
  );

  const allJsonl = [];
  const measuredRounds = {};
  let failures = 0;

  for (const id of taskIds) {
    const task = loadTask(id);
    const author = makeScriptedAuthor(id);
    const result = await runTask(task, author, { compiler });

    measuredRounds[id] = result.rounds;
    allJsonl.push(...result.jsonl);

    const wantRounds = EXPECTED_ROUNDS[id];
    if (result.rounds !== wantRounds) {
      console.error(`[${id}] rounds-to-green mismatch: got ${result.rounds}, expected ${wantRounds}`);
      failures++;
    }
    if (!result.green) {
      console.error(`[${id}] never went green within the round cap`);
      failures++;
    }
    if (!result.hiddenGreen) {
      console.error(`[${id}] hidden tests failed: ${JSON.stringify(result.hiddenDetail)}`);
      failures++;
    }
    // every round before the last must show at least one diagnostic (the whole point of the
    // scripted broken attempts is to exercise the feedback loop, not skip it)
    for (const line of result.jsonl) {
      if (!line.green_compile && line.diag_codes.length === 0) {
        console.error(`[${id}] round ${line.round} was non-green with zero diagnostics (broken-attempt design flaw)`);
        failures++;
      }
      // green_solved can only be true on a line that also compiled green (solved implies compiled)
      if (line.green_solved && !line.green_compile) {
        console.error(`[${id}] round ${line.round} has green_solved=true but green_compile=false (impossible)`);
        failures++;
      }
    }
    // the round that went green must show green_solved matching the task's hidden-test outcome
    if (result.green) {
      const greenLine = result.jsonl.find(l => l.round === result.rounds);
      if (!greenLine || greenLine.green_solved !== result.hiddenGreen) {
        console.error(`[${id}] green_solved on the green round (${greenLine && greenLine.green_solved}) does not match hiddenGreen (${result.hiddenGreen})`);
        failures++;
      }
    }
  }

  // reference.lm compiles clean and passes its own hidden tests, independent of the scripted
  // author path above (this is the gate the brief calls out explicitly).
  for (const id of taskIds) {
    const task = loadTask(id);
    const compiled = compiler.run(task.reference);
    if (!compiled.ok) {
      console.error(`[${id}] reference.lm does not compile clean: ${JSON.stringify(compiled.rawDiags)}`);
      failures++;
      continue;
    }
    const hidden = await import(new URL('./tasks/' + id + '/hidden_tests.mjs', import.meta.url));
    const hres = await hidden.run((src) => compiler.run(src), task.reference);
    if (!hres.green) {
      console.error(`[${id}] reference.lm fails its own hidden tests: ${JSON.stringify(hres.detail)}`);
      failures++;
    }
  }

  // JSONL well-formedness
  const jsonlBody = jsonlText(allJsonl);
  const lines = jsonlBody.split('\n').filter(l => l.length > 0);
  assert(lines.length === allJsonl.length, `jsonlText produced ${lines.length} lines, expected ${allJsonl.length}`);
  for (const [i, line] of lines.entries()) {
    let obj;
    try { obj = JSON.parse(line); }
    catch (e) { console.error(`jsonl line ${i} is not valid JSON: ${line}`); failures++; continue; }
    for (const k of REQUIRED_KEYS) {
      if (!(k in obj)) { console.error(`jsonl line ${i} missing key '${k}': ${line}`); failures++; }
    }
    if (typeof obj.round !== 'number' || obj.round < 1) { console.error(`jsonl line ${i} bad round: ${line}`); failures++; }
    if (typeof obj.chars_in !== 'number' || typeof obj.chars_out !== 'number') { console.error(`jsonl line ${i} bad char counts: ${line}`); failures++; }
    if (!Array.isArray(obj.diag_codes)) { console.error(`jsonl line ${i} diag_codes not an array: ${line}`); failures++; }
    if (typeof obj.green_compile !== 'boolean') { console.error(`jsonl line ${i} green_compile not boolean: ${line}`); failures++; }
    if (typeof obj.green_solved !== 'boolean') { console.error(`jsonl line ${i} green_solved not boolean: ${line}`); failures++; }
  }

  console.log('measured rounds-to-green:', JSON.stringify(measuredRounds));
  console.log('expected rounds-to-green:', JSON.stringify(EXPECTED_ROUNDS));
  console.log('jsonl lines:', lines.length);

  if (failures > 0) {
    console.error(`\nSELFTEST FAILED: ${failures} assertion(s) failed`);
    process.exit(1);
  }
  console.log('\nSELFTEST OK: all 10 tasks measured correctly, all hidden tests green, jsonl well-formed');
  process.exit(0);
}

main().catch(e => {
  console.error(e && e.stack || e);
  process.exit(1);
});
