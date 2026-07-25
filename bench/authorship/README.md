# bench/authorship/: the tokens-to-green corpus

This is `docs/AI_FEEDBACK_LOOP.md` section 3's authorship benchmark, and `VISION_2036.md` row 9's
resolver, actually standing (not just specified): a growing corpus of programming tasks, each with
a precise prompt and a machine-checkable pass criterion, used to measure how an AI author actually
does writing Lumen from scratch versus writing the same task in another language - no reference
code shown, same discipline as a held-out task.

The two metrics that matter, both already named in `RULES.md`:

- **`tokens-to-green`**: total tokens the author consumed (prompt + every iteration) to reach a
  program that passes the task's pass criterion.
- **`rounds-to-green`**: how many compile/check/run attempts it took, whether they failed or
  succeeded. A companion metric, **`first-try-compile-rate`**, is Lumen-specific: this is a
  distinct question from rounds-to-green, since a program can compile clean every time and still
  need several rounds to produce the *correct output* (see `tasks/black_scholes_call/RESULTS.md`
  for exactly this case).

## Layout

```
bench/authorship/
  README.md                    this file
  tasks/
    <task-name>/
      TASK.md                  the exact prompt given to the author, the pass criterion, the rules
      RESULTS.md                honest, unedited results for every run of this task
      solution.<ext>             the actual verified program from each language's run
```

## Adding a task

1. Pick something small, self-contained, and numerically or textually verifiable (a fixed set of
   inputs with a known-correct output beats "looks right" every time - see
   `tasks/black_scholes_call/TASK.md` for the pattern).
2. Write `TASK.md`: the prompt verbatim, the pass criterion, and the ground rules (no reference
   code, language docs are fair game, every round counts).
3. Run it: hand the prompt to a fresh agent/session with NO other context about this repo's
   existing solutions for the task, let it iterate to green or give up, and have it report rounds
   and a friction log honestly.
4. Record the real numbers in `RESULTS.md`, including when a language wins over Lumen - that is
   real, valuable data, not something to omit. See `tasks/black_scholes_call/RESULTS.md` for the
   house style: report the number, then report what actually happened, especially when it is not
   flattering.

## What this is not (yet)

This is a pilot corpus, not a statistically meaningful benchmark. `VISION_2036.md` is explicit that
row 9 (Lumen's AI-authorability bet) stays `Winnable, not yet won` until this corpus is wide enough,
across enough tasks and models, to show `tokens-to-green` actually beating the legacy stacks rather
than a single held-out task. Building this corpus out - more tasks, more languages per task, more
model runs per task - is the actual resolver for that row. This directory is where that work lives.
