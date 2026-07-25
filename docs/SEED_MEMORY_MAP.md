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
| `FIXUPS` | 181500 | |
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
per-opcode dispatch with roughly 70 `if op == N` arms sharing a flat binding scope, declaring 163
distinct locals across its lifetime.

Slot 63 onward silently overran into `FIXUPS`' own (pos, off, len) records starting at the old 178000,
corrupting in-flight fixups with garbage (off, len) pairs that decoded as plausible-looking but
bogus forward-reference names ('reg2', 'hi', 'rshift', ...), causing `resolve_fixups`'s `sym_find()`
to fail and emit spurious E0002 errors.

Fix: LOCALS was widened to 4000 bytes (500 slots, +207% over high-water mark) by pushing `FIXUPS`
from 178000 to 181500. `FIXUPS`'s ceiling is `CODE` at 211328, giving 2485 fixup slots.

## Record Tables (`FIELDS` and `RECTYPES`)

Record tables mirror the seed's global field model: fields are numbered by NAME across all record
types, first registration wins (index and type). `FIELDS` entries are 12 bytes `(name_off, name_len, ftype)`.
`RECTYPES` entries are 12 bytes `(name_off, name_len, arity)`. Trimmed from pre-GAP-A 14000 bytes to
1000 bytes (83 entries) to reclaim space for `TOKENS`.

## Seed Lexer 32-bit Truncation Bug (`i64::MAX`)

The seed's lexer accumulates Int literal digits into a 32-bit local ($val in $lex), silently truncating
literals past ~2.1e9. In `seed/lumenc.lm`, `i64::MAX` (9223372036854775807) is constructed via runtime Int
arithmetic: `(9 * 1e9 + 223372036) * 1e9 + 854775807` to avoid lexer truncation by the seed.

## Bug #25: 64-bit Integer Literals

Lumen Ints are 64-bit end-to-end. Truncation previously occurred when store32 wrote to token field `a`.
Literals within 32-bit signed range keep single-tokset (kind 2, `a=val`, `b=0`). Literals outside i32 range
use token kind 32 carrying low/high 32-bit halves (`a=lo`, `b=hi`). `c_primary` reconstructs the 64-bit constant
using `PUSH`, `SHL`, `SHR`, and `BOR` without introducing new opcodes.

## Dec Literal Parsing and Arithmetic Emission (D4)

Dec literals parse digits into an exact i64 scaled by 1,000,000 without Float intermediate.
Diagnostic codes match the seed's numeric codes (5: >6 frac digits, 6: overflow).
`emit_arith` / `emit_cmp` Dec paths run in parallel to Int/Float paths, converting TOS via `DFROMI`
(op 65) or using `tmp_local` scratch slot shuffle for LHS Int / RHS Dec.

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

## Narrative Comments Relocated from `seed/lumenc.lm`

### `is_d_suffix` contract
True if source byte `i` is `'d'` and not immediately followed by an identifier-continuation character, so a number directly abutting an identifier (e.g. a typo like `1death`) is not silently swallowed as a Dec literal + garbage; it lexes as before (`INT` then `IDENT`) and fails to parse, exactly matching the seed's own `$is_d_suffix` contract.

### `tk` Safety Guard
Token accessors: SAFETY (mirrors the seed .wat's `$tk`/`$ta`/`$tb`): any index at or past `get_ntok()` reads as EOF (kind 14, payload 0), so every `tk==14` guard correctly detects end-of-stream and no parser loop can walk past the token region into stale/unwritten memory from a prior compile.

### Single Type-Tag Decision Call-Site
(D4) Single call-site for the Float/Dec/Bool type-tag decision (record fields, fn params, fn return type). Keep every site routed through this one helper: duplicating the checks at more than one call site previously desynced the self-hosted compile from the seed's.

### `float_bits` Exact IEEE-754 Extraction
Parse a decimal float literal (bytes at absolute src addr `off`, length `len`) and leave the two i32 words of its f64 bits in `flo`/`fhi`. The VALUE is built exactly as the seed builds it (integer part + fractional part / 10^k), evaluated in Float arithmetic, bit-identical to the seed's parse by construction.
The BIT EXTRACTION uses only exact operations (multiply by 0.5/2.0 is pure exponent arithmetic; `m - 1.0` for `m` in `[1,2)` is exact by Sterbenz; doubling a <53-bit fraction and subtracting 1.0 is exact). Factored out so `dec_to_float` can reuse it for a FIXED value (`1_000_000.0`, the `FPUSH` constant in `I2F`/`FPUSH`/`FDIV`).

## If you need more SRC room

Condense comments before adding logic, and prefer moving narrative into this file over deleting
it. The region table at the top of `lumenc.lm` should stay inline, because that is what a reader
needs while editing the compiler; the history of how each number was chosen belongs here.


