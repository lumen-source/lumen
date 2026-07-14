# promptgreen v0: the rounds-to-green rig

This is the measurement rig for Pillar A of `docs/LUMEN_UNIVERSAL_COVERAGE_PLAN.md` section 4
(the prompt-to-green benchmark), built hermetically: no network call, no real model API. It
proves the rig measures rounds-to-green and approximate tokens-to-green correctly, against a
deterministic scripted author. It does not yet run a real model, and it does not compare Lumen
to any other language. Both of those are later work packages (WP-promptgreen), gated on this
rig existing and passing its own selftest.

One honesty caveat about "green": in the per-attempt JSONL, `green` means the candidate
compiled with zero diagnostics, not that it solved the task. Whether the hidden tests pass is
computed by the runner but is not persisted in the log, so an aggregate "solved rate" or
"green rate" is deliberately NOT claimed here yet; adding it (and logging the hidden-test
outcome) is the first follow-up when a real author is wired in.

## What v0 does

- `runner.mjs`: the protocol. Given a task (a spec, a hidden test module, a reference
  solution) and an author function `(spec, priorDiagnostics, round) -> source`, it compiles
  each attempt with the real seed compiler (`seed/compiler_core.mjs`), and on failure builds
  structured diagnostics (`seed/diagnostics.mjs`) and feeds back ONLY those diagnostics for the
  next round. Never leaks the hidden tests to the author. Caps at 5 rounds. On green, runs the
  task's hidden tests. Logs one JSONL line per attempt: `{task, round, chars_in, chars_out,
  approx_tokens_in, approx_tokens_out, diag_codes, green}`.
- `scripted_author.mjs`: a deterministic fake author with a canned attempt sequence per task
  (see `EXPECTED_ROUNDS`). Several tasks deliberately fail once or twice with a known
  diagnostic code before the attempt that goes green, so the diagnostic-feedback loop is
  actually exercised, not just the happy path.
- `tasks/t01` .. `tasks/t10`: 10 frozen tasks spanning the shipped surface documented in
  `LANGUAGE.md`: int arithmetic, while loops, text, bools (no `Bool` type; truth values),
  floats (scaled-int output via `round`, per house style), float arrays, records, sum types +
  `match` + `?`, a small pricing-flavored task (present value), and a byte-kernel task using
  `load8`/`store8`. Each task directory has `spec.md` (what an author sees), `reference.lm` (a
  correct solution, verified to compile clean and pass its own hidden tests), and
  `hidden_tests.mjs` (exports `run(compileFn, source) -> {green, detail}`; never shown to an
  author).
- `selftest.mjs`: runs the scripted author over all 10 tasks and asserts the measured
  rounds-to-green vector exactly matches the scripted expectation, every reference.lm compiles
  clean and passes its own hidden tests, every non-green round actually carries a diagnostic
  (the broken attempts are not accidentally green), and the JSONL log is well-formed. Exit
  0/1.

## What v0 does NOT measure

- **No real model.** The only author in this repo is `scripted_author.mjs`, a fixed lookup
  table. Plugging in a real model is a real author function with the same signature; nothing
  here claims or implies a live "prompt-to-green" number for any model.
- **No Lumen-vs-X comparison.** There is no control-language harness in this lane. A ratio to
  Python or Rust requires running the same protocol against those languages with the same
  model, which is out of scope here.
- **Approx tokens, not tokens.** `approxTokens` in `runner.mjs` is `Math.ceil(chars / 4)`, a
  crude placeholder with no relationship to any real tokenizer. It exists so the JSONL schema
  has the right shape before a pinned tokenizer lands. Never report a number derived from it
  as "tokens": call it "approx tokens" and say what it is a proxy for.
- **10 tasks, not 100+.** The section-4 target corpus is >= 100 tasks. This lane freezes 10 to
  prove the rig; growing the corpus is WP-promptgreen (parallel, ongoing), one task per PR,
  each with its own spec/reference/hidden test set, never touching the language to make a task
  fit (see the brief's stop rule: if a task needs an unshipped feature, change the task).

## How a real author plugs in later

An author is just an async function matching this signature:

```js
async function author(spec, priorDiagnostics, round) {
  // spec: the task's spec.md text (never the hidden tests)
  // priorDiagnostics: null on round 1, else the rendered structured-diagnostics text from
  //   the previous round (runner.renderDiagnosticsText)
  // round: 1-based attempt number, capped at runner.ROUND_CAP
  // returns: a Lumen source string
}
```

Call `runTask(task, author, { tokenize })` or `runAll(author, { tokenize })` from `runner.mjs`.
A real model-backed author lives outside this hermetic lane (it needs network access and an
API key, both forbidden here); it would call an actual model with `spec` and, on subsequent
rounds, the fed-back diagnostics, and return whatever source the model wrote. Swap in a real
`tokenize` hook (a pinned tokenizer for the target model) at the same time, and stop calling
the numbers "approx".

## Run it

```
node bench/promptgreen/selftest.mjs
```
