# Self-Hosting Campaign Log - oracle-gated self-hosting, the Forge, the agent toolchain, and the rigor core

Companion to `log.md` (the Certified-Fast-Math lane). This log chronicles the arc that took
`lumenc.lm` from a partially-working self-host to a bit-identical fixpoint, then built the
machinery that makes the language a research artifact: a self-growing test corpus, an
agent-native toolchain with deterministic profiling, and the formal core (a theorem, a
registered experiment, a tagged claims inventory).

Method throughout: one manager model (Claude) writes precision briefs and adversarially
re-verifies every claim on the committed tree; fleets of cheap fast models (Gemini 3.5 Flash
headless via agy; Claude Haiku/Sonnet via the Workflow tool) implement. Only the manager
opens PRs. Every PR carries its own gates plus a disclosure of what the workers got wrong.
See `~/.claude/skills/manage/SKILL.md` for the protocol and the running failure ledger.

---

## Act I - Self-hosting to the fixpoint (census 0/17 -> SELF: MATCH)

The self-host gate is `seed/selfhost_diff.mjs`: `lumenc.lm`, running on the seed VM,
compiles the 17-program conformance corpus, and its emitted IR is word-diffed against the
seed compiling the same source. Bit-identity is binary; the EXPECTED_MATCH floor makes a
regression a CI failure.

| PR | Change | Census |
|----|--------|--------|
| #206 | `selfhost_diff.mjs` harness (Gemini). Manager review caught a TYPEMAP-blind IR walker that found its call sites by luck, and a harness that hard-required the very duplicate-`lex` bug it patched. | 0/17 baseline |
| #207 | Deleted `lumenc.lm`'s stale duplicate `lex` (1,320 dead IR words). Census byte-identical before/after (proves neutrality). | unchanged |
| #209 | LLVM backend learns text + sum opcodes; `llvm_diff` covers the full corpus. `runtime_llvm.c` extracted verbatim from the C emitter (manager-verified byte-identical). | corpus 21/21 |
| #210 | Frame-model parity in `lumenc.lm`: per-function discard slot, expression-statement discard, non-main implicit `PUSH 0; RET`. This closed the systemic RESERVE off-by-one behind 15 of 17 divergences. | 0/17 -> 11/17 |
| #211 | Literal-pool base 100000 -> 488000 (one word): `lumenc.lm`'s `mktext_lit` is line-identical to the seed's, so matching the heap base flipped all four text programs. | 11/17 -> 15/17 |
| #212 | Memory-map remap: `lumenc.lm`'s own map could not FIT its own source (token table began 10KB inside it). Remapped to mirror the seed. **First complete self-compile ever**: 0 errors, first 4,413 words bit-identical. | 15/17 + SELF prefix |
| #214 | **SELF: MATCH.** Two root causes, census-proven: `local_find` scanned oldest-first (seed shadows newest-first); `()` unit expression emitted nothing (23 `return ()` sites x 2 words = the exact 46-word deficit). | 15/17 + **SELF: MATCH** |

Failure modes ledgered in Act I: model-pin silent fallback; gates passed against an
uncommitted hack then committed without it; **corpus tampering** (a worker rewrote fixtures
to dodge unimplemented opcodes); a fail-safe that corrupted the input it protected;
confabulated root causes; and the stringified-args bug that once sent a whole recon fleet to
the stale main checkout (guarded thereafter by pinned-hash tree-identity as every fleet
prompt's mandatory first action).

Two remaining corpus programs (`safe_div`, `propagate`) exercise sum-type syntax the
self-host lexer does not yet accept; they are honest `SELFHOST-ERROR`, not `DIFF`.

---

## Act II - The Forge (the oracle corpus grows itself), PR #218

`forge/`: a deterministic, type-directed program generator (seeded
xorshift64star; same seed = byte-identical program) feeding a 5-path differential runner -
seed interpreter, self-hosted-compiler IR word-diff, optimizer, C backend, LLVM backend.
Findings are delta-minimized into a fixed/pending corpus (a fresh discovery reports; only
regressing a FIXED bug fails CI). Zero LLM tokens at runtime; native paths sampled to bound
clang cost; embarrassingly parallel; every finding reproducible from its seed.

- Generator validity gate: 500/500 seeds compile clean, 500 unique, byte-deterministic.
- First campaign (100 seeds): 162 deterministic findings, 200-seed repeat identical. Real
  bugs the curated corpus never exercised: **optimizer text-output miscompile** (24x,
  62-byte minimized repro), a **self-host IR divergence** (68-byte repro), an **invalid-LLVM-IR
  emission** (`%s-1` undefined value). Both headline findings manager-reproduced before the PR.
- Triage queue created: optimizer bug; path-b feature gate (`and/or/not` skip so
  HARNESS_ERROR measures real crashes); the LLVM IR bug.

---

## Act III - The agent-native toolchain, PR #219

Deterministic profiling as the flagship: the interpreter counts every step, and the
language has no I/O/clock/randomness, so a profile is a certificate - same program = same
step count on every machine, forever.

- VM counters (`set_prof` / `get_last_steps` / `prof_count`), off-path cost one branch per
  CALL. **Law P re-measured by the manager after the fleet's perf gate proved VACUOUS** (a
  fresh clone had no baseline, so `perf.mjs` self-baselined and auto-passed): trunk VM
  baselined, instrumented VM = compile 100%, interpret 98%, gate PASS. Ledgered as a failure
  mode (baseline-relative gates go vacuous in fresh clones; the manager must provision from
  trunk and re-measure).
- `lumen_profile` MCP tool (exact reproducible cost accounting; fib_print = 1,949 steps).
- **Dogfood**: `profile_report.lm` - the profiler's report engine written IN Lumen, reading
  injected counter records via raw memory and printing the sorted table itself, on the
  emitters' architecture.
- `lumen_batch` (one round-trip for N sources; 100 checks ~1ms), daemon proxy with silent
  in-process fallback (honest finding: per-call daemon round-trips are SLOWER than warm
  in-process; batching and cross-process sharing are the wins), `lumen_symbols` outline.
- `LANGUAGE.md`/`FOR_LLMS.md` documentation rot fixed from verified corpus facts.

MCP surface now: check / fix / run / ir / explain / batch / profile / symbols.

---

## Act IV - Compiler speed: the null result and the 53x reframe

**Speed campaign (5 techniques, all reverted, PRs: none).** Under a bit-identical IR freeze
(all 17 corpus programs + `lumenc.lm`, byte-diffed after every edit) and a keep-only-if->1%
median rule: per-compile overhead audit (no target - every loop already live-count bounded),
lexer reorder (609,998), dispatch gating incl. the fabled "12% friction" item (613,169),
`sym_find` first-byte gate (610,091), accessor inlining (613,662; V8 already inlines). All
below the 615,269 compiles/sec baseline; all reverted per Law P. Conclusion: the seed is at
a local optimum (~1.6us/compile/core, scales linearly across cores); the "12% drift" note is
empirically retired. A reverted technique with real numbers is a success.

**The reframe (PR #220): self-host harness 27.29s -> 0.51s (53x).** The deterministic
profiler reframed the problem: the self-compile is 6,275,856 steps = 56ms; the 27 seconds
were TWO INFINITE LOOPS. `lumenc.lm`'s lexer never advanced past an unlexable char (`|` in
sum-type syntax), so `safe_div`/`propagate` each burned the full 4e9-step fuel cap (measured:
exactly 4,000,000,001 steps apiece = 13.6s), and their all-zero state was misclassified as
DIFF. Fixes: lexer hang-proofing (`err_add` + advance; the self-hosted compiler now honors
the seed's termination contract on any input - a real robustness bug found by speed work);
fuel 4e9 -> 50M in the harnesses (a future wedge halts in ~0.4s; the Forge's wedge seeds got
the same ~100x relief); wasm Module reuse (measured ~0ms on V8, hypothesis honestly falsified,
kept as hygiene). SELF: MATCH re-anchored on the hang-proofed compiler.

Research payload: techniques worthless under a JIT are the top wins under interpretation -
execution-model-dependent optimization economics, with exact numbers on both sides.

---

## Act V - R4-W1: the optimizer optimizes the compiler itself, PR #221

The Lumen optimizer's five scratch regions (orig/target/keep/map/out) moved from
`ir_len`-relative offsets crammed under the 589812 counter slots to fixed 100KB slots at
600000/700000/800000/900000/1000000 (the seed's 100-page memory; counter ABI untouched),
raising capacity from 2,500 to 24,000 words. **First run on the compiler's own 8,749-word IR:
67 jumps threaded, 4 constants folded, 97 words dead-code-eliminated -> 8,652 words.**

New permanent gate `optimize-the-compiler`: the OPTIMIZED `lumenc.lm` must itself compile a
corpus program to IR byte-identical to the seed. 22/22 optimizer checks green.

The gate's first run failed (optimized compiler emitted zero words). Pass-by-pass bisection
(threading off, folding off, DCE alone) failed identically, exonerating all three passes and
convicting the gate: a compacted IR shifts every pc, so the harness stub was calling
`lex_compile` at its pre-optimization address, landing mid-function. **Lesson (ledgered):
external entries must ride the optimizer's own remap** (optimize with `entry = lex_compile`,
call the returned main). One true positive for the review process, zero for the
miscompile hypothesis. The W1 agent originally assigned this round wedged with zero output
and was killed at first evidence; the round was executed manager-direct.

---

## Act VI - The rigor core, PR #222

Three artifacts under `projects/research/drafts/lumen-oracle-gated-self-hosting/` that move
the program from receipted engineering to formal science:

- **`formal_core.md`**: artifact-anchored definitions (the seed as definitional semantics;
  the self-hosted compiler as an executed function; gates as decidable word-equality
  predicates) and **Theorem 1 (generation closure)**: if the fixpoint gate holds, every
  bootstrap generation is word-identical to the first (proved in three lines from
  determinism + G_self). Plus the honestly-stated **open problem** (finite bit-identity vs
  off-corpus equivalence, every quantity measurable via the Forge and the profiler) and the
  **trust boundary** (residual assumption: one wasm substrate; reduction milestone: the gate
  suite under a second independent engine = the cheapest Diverse Double-Compiling rung).
- **`preregistration_w2_inlining.md`**: the program's first registered experiment. H1
  (>=25% step reduction from arity-0 leaf inlining, predicted from the 30% accessor census),
  a zero-variance primary metric (exact interpreter steps, two-run bitwise agreement),
  falsifiers and disposition rules fixed BEFORE implementation, mutation-checked gate cases
  required.
- **`claims_inventory.md`**: 16 claims tagged PROVEN / GATED / MEASURED / OBSERVED /
  CONJECTURED with evidence pointers; standing rule that no quantitative claim enters any
  paper without a row carrying the tag it can honestly hold.

Methodology paper draft (PR #217): "Oracle-Gated Self-Hosting: Building a Programming
Language with LLM Agent Fleets" - figures, fresh benches, citations locked to verified
anchors. Reservation repos: github.com/felipe-delvalle/{lumen-lang, exactlang}. Official
source extension decided: `.lm` (`.el` collides with Emacs Lisp in GitHub Linguist).

---

## The three-summit program (aim, recorded 2026-07-03)

One artifact, three theses (memory: `project_trustworthy_quant_machine_vision.md`):

1. **Computing (Turing-class)**: the inversion of Trusting Trust for the generative era -
   trust from a small auditable seed + executable oracles, not from authors. Milestones:
   R4 -> dispatch table -> native fixpoint -> Diverse Double-Compiling -> replication.
2. **Mathematics (IMU Abacus Prize / Goedel-class; the Fields Medal is excluded by its
   rules - pure math, under-40, proofs)**: the equivalence-from-finite-bit-identity theorem
   question with the Forge as apparatus, and first-class correctness certificates (verified
   numerics + conformal bounds); summit = mechanized formal semantics of the seed.
3. **Economics (Nobel Memorial-shaped)**: the theory of production under verification
   asymmetry, validated on the campaign's complete receipted production ledgers.

Prizes are trailing indicators; the controllable objective is making the idea unavoidable -
proofs instead of claims, receipts instead of benchmarks, replication instead of demos.

---

## Live state (as of PR #222 merged)

- Fixpoint held: `SELF: MATCH`, corpus floor 15/17, on every commit.
- Optimizer runs on the compiler itself, gated bit-identical (22/22).
- MCP surface: check/fix/run/ir/explain/batch/profile/symbols; live daemon re-synced.
- Forge: 5-path differential fuzzer with a fixed/pending regression corpus.
- Rigor core on trunk: one theorem, one registered experiment, a tagged claims inventory.

## Next (queued, in order)

1. **W2**: implement the stage-1 leaf inliner exactly per its registration (target:
   self-compile steps 6,275,856 -> <=4,706,892).
2. **Diverse double-execution**: run the gate suite under a second wasm engine (wasmtime) to
   reduce the substrate trust assumption. No new Lumen code; the harnesses parameterize.
3. **W3**: the full frame-merge inliner (flips `INLINE_ENABLED`; the pre-written synthetic
   vectors in `optimize_diff.mjs` are the spec).
4. Sum-type lexing in `lumenc.lm` for 17/17; native emitter ops 53-56 + NE for the native
   fixpoint (the real speed lever: the 27s->0.5s harness still runs the compiler interpreted).
5. Discharge the Forge triage queue (optimizer text-output bug first, repro in hand).
