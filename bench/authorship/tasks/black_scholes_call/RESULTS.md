# Results: black_scholes_call, pilot run 2026-07-24

Two independent Claude Sonnet 5 agents, each given ONLY `TASK.md`'s prompt (no reference solution,
no sight of the other agent's attempt), one authoring in Lumen, one in Python, iterating
independently until correct or giving up. Both reached the correct output. Real, unedited numbers
below - this is the first entry in the corpus, N=1 per language, a pilot standing up the loop, not
a verdict (see `docs/AI_FEEDBACK_LOOP.md` and `VISION_2036.md` row 9 for why N=1 is explicitly not
enough to claim a row won or lost).

| | rounds-to-green | tokens | first-try-compile | wall time |
|---|---|---|---|---|
| **Python** | 1 | 81,470 | n/a (no compile step) | 32.9s |
| **Lumen**  | 3 | 97,188 | **100%** (compiled clean on all 3 attempts) | 68.3s |

**Python won this round on raw tokens-to-green and rounds-to-green.** Reported straight, not spun -
this matches what `VISION_2036.md` itself already says to expect on a single held-out task before
the corpus and reinforcement loop have had any chance to work: "on raw first-try-compile a model
will often do better in Python out of sheer familiarity."

## What actually happened (the useful part)

Lumen's compiler fired **zero diagnostics** across all three attempts - every single `check`/`run`
call compiled cleanly. The two extra rounds were not a language or diagnostic failure: the author
wrote `console.print("\n")` after `console.print_int(...)`, not initially registering that
`print_int` already terminates with a newline (documented, but the author didn't cross-reference it
against their own code before running). The bug produced a blank line between each number - visibly
wrong once run, but nothing the compiler could catch, because it is valid, well-typed Lumen. The
author caught it by manually inspecting raw bytes (`od -c`), not via any tool-provided signal.

This is a genuine, actionable finding for the loop `AI_FEEDBACK_LOOP.md` describes: the friction
here was not "the language is hard to write" (0 diagnostics, 100% compile-clean), it was "nothing
in the toolchain told me my OUTPUT was wrong before I had to eyeball it." That is a real gap between
"compiles" and "green" that a tighter authoring loop could close - e.g. an MCP tool that runs a
program and diffs its stdout against an expected string in one call, so the author doesn't need a
separate manual verification step. Filed as a `MissingFix`/`Friction`-category signal per the
`AuthorFeedback` schema (`docs/AI_FEEDBACK_LOOP.md` section 1), not yet triaged into an RFC.

## Raw agent reports

Full verbatim reports (round-by-round friction logs, final source) are in this pilot's own
transcript, not reproduced here in full; `solution.lm` and `solution.py` in this directory are the
exact, verified final programs from each run (both re-verified to print the required 4 lines
byte-for-byte before being committed here).

## Honest limits of this pilot

- N=1 per language. No statistical claim follows from this; it is one data point per language on
  one task.
- Both attempts used the same model (Claude Sonnet 5) and the same base prompt. Different models,
  or the same model with more Lumen exposure via a growing corpus (the "reinforcement" step
  `VISION_2036.md` names as the actual resolver), would likely move these numbers - that is the
  entire point of building the corpus out rather than stopping at one task.
- No C/Rust/Go/Java arm run yet for this task (`bench/latency_corpus/kernel.lm` already has hand
  ported twins in those languages for the *compile-latency* shootout, a different metric; an
  authorship-from-scratch arm in those languages is a natural next addition here).
