// A deterministic fake author for the promptgreen selftest. It ignores the spec text and
// the fed-back diagnostics content, and instead returns the round's CANNED attempt for the
// current task, taken from a fixed table below. This exists to prove the rig measures
// rounds-to-green correctly, not to flatter it: several tasks deliberately emit a known-broken
// attempt (an unknown variable, an unknown function, a stray token, a missing brace) before
// the attempt that goes green, so the runner's diagnostic-feedback loop is exercised for real.
//
// Table: task id -> array of source strings, one per round, in order. The last entry in each
// array must compile clean and match the task's expected stdout (this is asserted against the
// real reference.lm text at selftest time, not duplicated by hand here, to avoid drift).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function ref(taskId) {
  return fs.readFileSync(path.join(__dirname, 'tasks', taskId, 'reference.lm'), 'utf8');
}

// Broken attempts, one constant per (task, round). Each is crafted to fail with exactly one
// diagnostic code from seed/diagnostics.mjs's REGISTRY (E0001 unknown variable, E0002 unknown
// function, E0003 unexpected token, E0004 missing '}'), verified against the real compiler
// while this table was authored.
const BROKEN = {
  t02_r1: `fn sum_upto(n: Int) -> Int {
  var sum = 0
  var i = 1
  while i <= n {
    total = total + i
    i = i + 1
  }
  return sum
}

fn main(console: Console) -> Unit {
  console.print_int(sum_upto(20))
}
`, // E0001 unknown variable 'total'

  t03_r1: `fn greet(name: Text) -> Text {
  return concat_text(concat_text("hello, ", name), "\\n")
}

fn main(console: Console) -> Unit {
  console.print(greet("lumen"))
}
`, // E0002 unknown function 'concat_text'

  t03_r2: `fn greet(name: Text) -> Text {
  return text_concat(text_concat("hello, ", name), "\\n") @
}

fn main(console: Console) -> Unit {
  console.print(greet("lumen"))
}
`, // E0003 unexpected token '@'

  t05_r1: `fn area(w: Float, h: Float) -> Float {
  return wid * h
}

fn main(console: Console) -> Unit {
  console.print_int(round(area(2.5, 4.0) * 100.0))
}
`, // E0001 unknown variable 'wid'

  t06_r1: `fn main(console: Console) -> Unit {
  let a = array(3)
  aset_at(a, 0, 1.5)
  aset(a, 1, 2.5)
  aset(a, 2, 3.0)
  var sum = 0.0
  var i = 0
  while i < alen(a) {
    sum = sum + aget(a, i)
    i = i + 1
  }
  console.print_int(round(sum * 100.0))
}
`, // E0002 unknown function 'aset_at'

  t06_r2: `fn main(console: Console) -> Unit {
  let a = array(3)
  aset(a, 0, 1.5)
  aset(a, 1, 2.5)
  aset(a, 2, 3.0)
  var sum = 0.0
  var i = 0
  while i < alen(a) {
    sum = sum + aget(a, i)
    i = i + 1
  }
  console.print_int(round(sum * 100.0))
`, // E0004 missing closing '}'

  t08_r1: `type DivError = | DivByZero

fn checked_div(a: Int, b: Int) -> Result[Int, DivError] {
  if b == 0 {
    return err(DivByZero)
  }
  return ok(a / bb)
}

fn show(r: Result[Int, DivError], console: Console) -> Unit {
  match r {
    ok(v) -> console.print(text_concat(text_concat("ok ", int_to_text(v)), "\\n"))
    err(e) -> match e {
      DivByZero -> console.print("div by zero\\n")
    }
  }
}

fn main(console: Console) -> Unit {
  show(checked_div(20, 4), console)
  show(checked_div(9, 0), console)
}
`, // E0001 unknown variable 'bb'

  t09_r1: `fn present_value(cashflow: Float, rate: Float, periods: Float) -> Float {
  return cashflow / powf(1.0 + rate, periods)
}

fn main(console: Console) -> Unit {
  console.print_int(round(present_value(110.25, 0.05, 2.0) * 100.0))
}
`, // E0002 unknown function 'powf'

  t09_r2: `fn present_value(cashflow: Float, rate: Float, periods: Float) -> Float {
  return cashflow / pow(1.0 + rate, periods) $
}

fn main(console: Console) -> Unit {
  console.print_int(round(present_value(110.25, 0.05, 2.0) * 100.0))
}
`, // E0003 unexpected token '$'
};

// The scripted rounds-to-green vector this author must produce, exactly, on the full task
// set. selftest.mjs asserts the measured vector against this table.
export const EXPECTED_ROUNDS = {
  t01: 1, t02: 2, t03: 3, t04: 1, t05: 2,
  t06: 3, t07: 1, t08: 2, t09: 3, t10: 1,
};

function attemptsFor(taskId) {
  const n = EXPECTED_ROUNDS[taskId];
  const attempts = [];
  for (let round = 1; round < n; round++) {
    const key = `${taskId}_r${round}`;
    if (!(key in BROKEN)) throw new Error(`scripted_author: missing canned attempt ${key}`);
    attempts.push(BROKEN[key]);
  }
  attempts.push(ref(taskId)); // final round always the real reference solution
  return attempts;
}

// Cache built lazily per task id (attemptsFor reads a file each call; keep it cheap).
const CACHE = new Map();

// The author function itself: (spec, priorDiagnostics, round) -> source.
// `task` closes over which task is currently running, set by the harness; since runner.mjs
// does not thread a task id into the author call, we expose a factory instead.
export function makeScriptedAuthor(taskId) {
  if (!CACHE.has(taskId)) CACHE.set(taskId, attemptsFor(taskId));
  const attempts = CACHE.get(taskId);
  return async function scriptedAuthor(_spec, _priorDiagnostics, round) {
    const idx = Math.min(round, attempts.length) - 1;
    return attempts[idx];
  };
}
