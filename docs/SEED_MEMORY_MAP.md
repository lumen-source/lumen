# The seed memory map, and why each region sits where it does

`seed/lumenc.lm` must compile itself inside a fixed memory map, and its own source must fit
inside the `SRC` window (`SRC_CAPACITY = 70000`, `seed/compiler_core.mjs:44`). That window is a
hard limit, not a guideline: exceed it and the self-hosting gate fails with
`lumen: memory trap: source exceeds the 70000-byte SRC window`.

Because the compiler's own comments consume that budget, the narrative history of the map lives
here rather than in `lumenc.lm`'s header. The header keeps the region table and a pointer to
this file. This is the same trade the project has made before: `AGENTS.md` records a historical
memory-map comment block trimmed from roughly 2949 bytes to 1650 to make room for logic.

## Current regions

| Region | Base | Note |
|---|---|---|
| `SRC` | 100000 | 70000 bytes. The self-hosted compiler's own source must fit here |
| `SYMBOLS` | 170000 | |
| `PARAMS` / `LOCALS` | 177000 / 177500 | |
| `FIXUPS` | 178000 | |
| `CODE` | 211328 | The only region that differs from the seed, because the seed's `CODE_BASE` holds this compiler's own IR |
| `DIAG` | 297000 | Ends at 299000, so exactly 166 twelve-byte records. See "The DIAG cap" below |
| `TOKENS` | 299000 | 189000 bytes, 15750 tokens |
| literal heap | 488000 | **Pinned. Must never move.** See GAP-A below |

## D4: why SRC was widened to 70000

`SYMBOLS`, `PARAMS`, `LOCALS` and `FIXUPS` shifted by +20000 from the pre-Dec layout to widen
`SRC` from 50000 to 70000 bytes. The reason was concrete: `lumenc.lm` with Dec support exceeds
the old 50000-byte cap when it compiles itself.

## GAP-A: the pinned literal heap, and the silent token clobber it caused

Found by `native/selfcompile_diff.mjs`.

The literal-heap start is baked into every compiled program's emitted IR as an absolute address.
It therefore cannot shift the way the other regions did; it must stay pinned at the seed's
488000.

That pinned ceiling capped `TOKENS` at 92000 bytes, or 7666 tokens, which is below what real
self-hosted compiles need: `lumenc.lm` itself reaches 14420 tokens. Tokens beyond 7666 were
silently clobbered by the literal-heap bump allocator as soon as the first string literal was
emitted. The symptom was garbage-span parse diagnostics (`E0001`, `E0004`), never a lex-level
divergence, because lexing itself stayed correct. That is a hard failure mode to read: the
errors point at source positions that look arbitrary.

The fix did not move the pinned heap. `CODE`'s reserved room was over-provisioned by more than
2x (39668 words against a 16503-word high-water mark). Shrinking it to 19668 words, still 19
percent above high water, and repacking `VARIANTS`, `PTYPES`, `LTYPES`, `RETTYPES`, `FIELDS`,
`RECTYPES` and `DIAG` after it reclaimed enough slack to widen `TOKENS` to 189000 bytes, 15750
tokens, 9 percent of headroom, without moving the pinned heap start or any baked address.

Gates that keep this honest: `native/native_resident_test.mjs`,
`native/native_fixpoint_test.mjs`, and `seed/selfhost_diff.mjs`'s `SELF(lumenc.lm)` case.

## LOCALS: a per-function budget, not a whole-program one

`LOCALS` entries are 8 bytes (name offset, name length). `get_nlocal()` resets to 0 at the start
of every function (`c_fn` calls `set_nlocal(0)`) and never shrinks again until the next `fn`. So
its true capacity requirement is "however many distinct `let` and `var` bindings the single
largest function in any toolchain source declares", not a whole-program budget.

The old span `[177500,178000)`, 500 bytes and therefore 62 slots, was fine for ordinary
functions. `native/emit_llvm.lm`'s `emit_op()` is not an ordinary function: it is one giant
per-opcode dispatch with roughly 70 `if op == N` arms sharing a flat binding scope.

## The DIAG cap

`DIAG` is `[297000,299000)` and `TOKENS` begins at 299000, so the region holds exactly
`(299000 - 297000) / 12 = 166` diagnostic records.

The WAT seed has always guarded this (`seed/lumenc.wat:581`, `nerr >= 800` returns early). The
self-hosted port dropped the guard, so diagnostic 167 began writing past the end of `DIAG` and
into the token stream mid-parse: every diagnostic past 166 was silently lost, and the parser
continued against corrupted tokens. Bracketed empirically at 165 reported, 166 reported, 170
truncated to 166. Restored as an explicit cap in `err_add`.

Note that `native/lumenc_native.mjs`'s `DIAG_RECORD_CAP = 500` does not protect anything: 500
records is 6000 bytes, which runs 4000 bytes past the start of `TOKENS`. The producer-side cap
is the one that matters.

## If you need more SRC room

Condense comments before adding logic, and prefer moving narrative into this file over deleting
it. The region table at the top of `lumenc.lm` should stay inline, because that is what a reader
needs while editing the compiler; the history of how each number was chosen belongs here.
