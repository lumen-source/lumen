# LLM bandwidth and the prompt-to-B2B-SaaS path

Status: design. This document specifies how Lumen becomes the highest-bandwidth substrate for a model (local or cloud) to author, compile, fix, and ship B2B SaaS software with the fewest tokens and the tightest local loop. It is subordinate to docs/spec/SYNTHESIS.md (the integrated design of record) and consistent with MANIFESTO.md and VISION_2035.md. Where this document and SYNTHESIS conflict, SYNTHESIS wins.

Three things are true today and shape every decision here. The seed compiler (seed/lumenc.wat) compiles only the Int control-flow subset and emits zero diagnostics. Compile is already sub-millisecond. No bench/authorship corpus, no FOR_LLMS.md, no /lumen skill, and no DIAGNOSTIC_SCHEMA.md exist yet. So this is a build plan, not a description of running behavior.

## 1. Principles

1. Bandwidth is the four commitments measured, not a fifth commitment. Clarity is tokens-per-construct; debuggability is warm edit-to-fix latency and auto-fix coverage; provability is scoped so it does not tax ordinary code; self-improvement gates tokens-to-green.
2. The highest-bandwidth lever is removing the model from the loop for confident fixes. A fix the compiler applies costs zero model tokens.
3. The second lever is transport, not language. Warm daemon plus span-edit patches cut per-round token and latency cost without changing semantics.
4. Reuse the single mechanism. SaaS I/O is capabilities-as-parameters, never a new framework grammar.
5. Stay honest on zero-legacy. Bridge model unfamiliarity with in-context grounding, not borrowed syntax. Keep self-containment a build-time property and say where deploy steps outside it.

## 2. Token-bandwidth design

### 2.1 Tokenizer-aligned canonical surface

Pin one content-addressed open-weight tokenizer, governed by the same provenance and re-pinning rule as the merge-gating model snapshots. Ship `lumen tokens <file|construct>` that scores tokens-per-construct under that vocab. The existing keyword set (fn, let, if, else, return, match, type, and, or, not) is already near-optimal: short common English words that almost always encode as one BPE token. This document does not introduce new keywords for SaaS.

Lexeme density is reported and reviewed, not a hard merge-block. Clarity wins on conflict. The held-out and metamorphic benchmark shards remain, so density tuning can never silently reward legacy-familiarity, which the vision distrusts.

Resolve the seed-versus-spec inconsistencies that cost tokens or attention, choosing one way each: make the return-type arrow mandatory consistently, settle chained comparison (the GRAMMAR.md E0150 error stance versus the LUMEN_MU.md sugar stance), and fix digit-separator lexing so 1_000_000 is one Int literal.

### 2.2 Dense, low-risk builtin forms

The corpus shows int_to_text, text_concat, and text_eq as high-frequency multi-subword builtins. Adopt denser canonical forms only where the density win is an explicit AI-first argument and not merely borrowed convention: `n.text` for Int-to-Text, `==` on Text for equality. A concat operator is deferred pending a measured win versus a method form, because the critics flagged operator borrowing as zero-legacy tension. Every such change must show its tokens-per-call-site delta in `lumen tokens` and survive the metamorphic shards.

### 2.3 Token-budgeted diagnostics (see Section 3)

The machine diagnostic stream carries typed args, a stable code, and a fix span, never the English message. The message is rendered downstream from a code registry by `lumen explain`. This is the largest per-round token saving on the feedback side.

### 2.4 Canonical formatter

Keep the fully-delimited grammar and the single canonical formatting with its idempotence invariant format(parse(format(x))) == format(x). Among renderings of equal clarity the formatter may prefer the denser one (one canonical indent unit, at most one consecutive blank line), but clarity is the primary objective and density is the tie-breaker. We do not redefine canonical as cheapest.

### 2.5 Comments

Comments and doc-comments stay in the language and in the human view. We do not strip them from the model's read-back form, because types do not encode intent, invariants, or edge-case reasoning, and stripping them trades against the debuggability commitment. The compact wire AST (Section 3.3) is a separate, comment-elided representation used only for structural navigation, not the canonical source the model edits.

### 2.6 Targets

- 100% of keywords and operators are single-token in the pinned vocab (reported).
- Builtin median <= 2 tokens, down from ~3 to 5 for the underscore forms.
- Indentation and delimiter overhead <= 15% of total file tokens in canonical form (measure baseline first, then ratchet).
- CI blocks any change that raises median tokens-to-green > 5% on bench/authorship.

## 3. The local LLM-to-compiler iteration loop

### 3.1 The canonical Diagnostic (the load-bearing missing half)

Implement the already-specified canonical Diagnostic in the front end. Begin with a seam in the seed: a diag memory region plus diag_count() and diag_at(i) exports the parser writes into, so the compiler becomes a structured advisor instead of a PASS/FAIL oracle. Grow it into the Phase 2 checker so the rich codes (E0001 parse, E0102 type-mismatch, E0210 non-exhaustive-match) carry typed expected/actual args, byte spans, and machine-applicable fix edits.

Author docs/spec/DIAGNOSTIC_SCHEMA.md as an executable, schema-versioned JSON record with named fields. Reject the positional binary tuple form: the critics were right that it is drift-prone and fights the one-canonical-artifact principle, and the real token lever is the author-side span edit, not a few bytes shaved off the download side.

Ship `lumen check --errors=json` and `lumen check --fix`. The fix pass applies every high-confidence fix (E0102 wrap with the conversion, E0150 split the chained comparison, E0210 add the missing arm) on the server and returns the patched source plus only the residual diagnostics, in one frame, with the model never seeing the fixable errors.

### 3.2 The warm daemon (lumend) and MCP surface

Build `lumen serve`: a long-lived process that performs the one-time wabt assemble and WASM instantiate at startup, then listens on a Unix domain socket (no TCP, no network) for length-prefixed frames: check, fix, ast, type, effects, callers, run. It keeps per-session source, token, and IR state warm and recompiles only the dirty span. Today every invocation re-runs the ~8.3ms assemble and exits; the daemon amortizes that to one cold start so each subsequent request is the sub-millisecond compile plus socket overhead.

Wrap the daemon with `lumen-mcp`, an MCP server exposing those operations as tools returning structured JSON. A local open-weight model or a cloud model behind an MCP client iterates against the compiler as a tool and navigates the program by structured query (ast, type, effects, callers as JSON) instead of re-reading source text.

Host-code honesty: lumend, the socket server, and lumen-mcp are non-Lumen host code (Node plus a vendored lumenc.wasm, with wabt demoted to a build-only tool). The MANIFESTO substrate exception covers the WASM engine, not this host. This is acknowledged legacy debt, scheduled to be re-derived in Lumen as the language self-hosts; until then the loop runs on a non-Lumen host and we record it on the remaining-legacy-assumptions watch list.

### 3.3 Span-edit patch protocol and compact AST

The daemon keeps per-session source keyed by a session id and a content hash. The model sends a span edit (replace bytes [a,b) with text) plus the base hash; the server verifies the hash, applies, recompiles, and returns residual diagnostics plus the new hash. On hash mismatch it falls back to full resync. Add `lumen ast --json --compact` (positional, key-elided, content-addressed) for structural navigation. The session content hash is a transport concern and lives in the daemon protocol, not bolted onto the Determinism Contract.

### 3.4 Built-in authorship metering

The daemon records per-session tokens-in, tokens-out, rounds-to-green, and wall-ms, auto-emitting the AuthorFeedback record and seeding bench/authorship. This makes tokens-per-green-program a measured number with a CI regression gate, operationalizing the self-improvement commitment.

### 3.5 Targets

- Warm edit-to-diagnostic p50 < 5ms, p99 < 50ms, zero network syscalls (verified under strace or seatbelt with the interface down).
- One-time cold start (assemble plus instantiate) < 30ms; per-request cost excludes it.
- Median diagnostic <= 25 machine-stream tokens versus an ~80-token English baseline.
- Median per-fix-round model upload < 40 tokens (span edit) versus ~1000-token full-file resend.
- Server-side confident-fix covers >= 40% of emitted diagnostics; mean rounds-to-green reduced >= 30%.
- Warm throughput >= 2000 check requests/sec on one core.

## 4. The prompt-to-B2B-SaaS path

The target shape is docs/b2b_saas_architecture.md: a multi-tenant quant platform with an async submit-then-poll job contract over a queue, autoscaling workers, and a result store. We reach it through capabilities, not a web framework grammar.

### 4.1 The SaaS capability battery

Add Http, Sql, Queue, Auth, Tenant, and Secret as standard capability types passed as ordinary typed parameters, exactly as Console is passed today. The effect row is derived from the parameter list and never hand-written; a function with zero capability parameters is provably pure. Each capability ships a real production implementation and a deterministic fake (in-memory Sql, fake Queue, frozen Clock, seeded Random) so every loop iteration is replayable and a failed run is a stable measurement, not a flake.

Tenant-as-capability is the load-bearing isolation guarantee. Auth verifies a token and produces a Tenant value; every data-touching handler takes Tenant as an explicit parameter. A handler that omits Tenant provably cannot reach tenant data, so cross-tenant access is a compile error. Tenant is explicit in the signature, never auto-injected by a hidden dispatcher; the critics correctly flagged auto-injection as nonlocal magic that contradicts blast-radius-in-the-signature. The guarantee is only as strong as the Sql and Tenant capability implementations, so those get their own conformance and adversarial tests.

### 4.2 The async job lifecycle as stdlib, not grammar

Add a stdlib sum type Job[T] = Queued | Processing | Completed(T) | Failed(Error). The submit, worker, and poll wiring is a library function over the Queue and Store capabilities, not a new keyword and not a Pub/Sub-coupled syntax form. The worker body is decode? then compute? then persist?, where the non-coercing ? short-circuits to Failed and triggers retry or dead-letter routing. Exhaustive match on Job makes an unhandled state a compile error. This collapses the half-mocked worker and stubbed poll endpoint of the reference impl into one inspectable library form whose desugaring is visible via `lumen ast`.

### 4.3 Record-derived wire codec

A record type auto-derives canonical deterministic JSON encode, decode, and request-body validation. Decode failures surface as the canonical Diagnostic with typed expected/actual and byte spans. Schema version is content-addressed so wire evolution is checkable. This closes the explicitly-missing serialization dimension and gives the submit/poll envelope a single source of truth, interoperable by construction with the existing FastAPI contract.

### 4.4 Numbers for SaaS

Bring D9 reproducible-default floats forward (strict IEEE-754, no FMA, no reassociation, vendored libm, canonical NaN; fast forbidden on recorded paths) to unblock the quant compute core. Add an exact decimal or integer-cents money type for billing; billing must not use IEEE-754 floats. These are the wedge numerics, pulled ahead of the still-undecided full numeric tower.

### 4.5 Verification scoping

Default `lumen check` enforces types, exhaustiveness, effects, and capability checking, the tier that makes code shippable. Proof obligations (requires/ensures contracts, refinements, fail-below-proven) attach only to functions that carry contracts, such as the verified quant kernel. Functions with no contracts are trivially proven and never pay the SMT-discharge cost. This keeps the fail-below-proven semantics intact while not inflating rounds-to-green for ordinary endpoints.

### 4.6 The local serve-and-ship loop

`lumen serve` runs the service against the deterministic fakes, hot-reloads on file change, and a contract-conformance harness asserts the generated endpoints satisfy the submit/poll envelope (POST returns job_id with status Queued; GET returns Queued, Processing, Completed, or Failed). The loop is: model writes api.lm, `lumen check --errors=json` returns a structured verdict, confident fixes auto-apply, `lumen serve` reloads, the contract harness returns a structured pass or fail.

### 4.7 Deploy, stated honestly

`lumen deploy` emits a deployment descriptor (Cloud Run service, queue topics and dead-letter, push subscriptions) derived from the capability-typed service description, with tenancy tier (shared pool versus dedicated) as a flag. We do not claim this is self-contained. Self-containment is a build-time property: no networked package manager, no network during compile, one static binary. The deployed service reaches the network only through capabilities whose nondeterminism is tainted and quarantined. The emitted GCP descriptors are vendor-specific networked artifacts that live outside the air-gapped-build mandate; the codegen-ISA analogy does not apply to them. Deploy is therefore a later-phase, opt-in convenience, not part of the zero-legacy identity.

### 4.8 Targets

- Smallest working multi-tenant CRUD+jobs+auth service <= 35 lines and <= 700 Lumen tokens.
- Tokens-per-CRUD-route < 25; a JSON-validated request type is 1 declaration replacing >= 4 artifacts.
- Edit-to-reloaded-service < 800ms via `lumen serve`.
- First-try-compile-rate >= 65% and mean rounds-to-green <= 2 on the SaaS authorship bench for a pinned open-weight model after the corpus and reinforcement loop mature (post-RL; unproven today).
- Tokens-to-green for the full SaaS task <= 1.3x the reference solution.
- A deployed Lumen service container < 15 MB (static binary, no language runtime), cold start targeting the Go edge-gateway sub-50ms rationale. Unvalidated until the D4 backend is locked.

## 5. Zero-legacy and self-containment ledger

- Pinned tokenizer: an external, legacy-origin artifact, vendored and content-addressed; used for measurement and advisory gating only. Re-pinning follows the (still-to-be-written) model-drift protocol.
- lumend, the socket server, lumen-mcp: non-Lumen host code, acknowledged legacy debt, re-derived in Lumen as the language self-hosts.
- Dense builtin forms (n.text, == on Text): each must carry an explicit AI-first density argument and survive the metamorphic shards; not adopted as borrowed convention.
- SaaS capabilities and the job library: language-level capabilities and stdlib over the single mechanism, not networked packages, so the air-gapped build holds.
- Deploy descriptors: outside the self-contained mandate by design, stated openly.

## 6. Phased build order

- Phase 0 to 0.5: pin the tokenizer and build `lumen tokens`; author FOR_LLMS.md, the machine-readable spec bundle, and CLAUDE_CAPABILITY_PROFILE.md; author the executable DIAGNOSTIC_SCHEMA.md; create bench/authorship.
- Phase 1: add the diagnostic-emission seam to the seed; ship `lumen ast --json` and `--compact`; first authorship metrics.
- Phase 2: rich typed diagnostics in the checker; `lumen check --errors=json` and `--fix`; build lumend, the span-edit protocol, and lumen-mcp; add tokens-to-green to the regression gate; ship the /lumen skill.
- Phase 2.5 (new, SaaS walking skeleton): Text, records, and the auto-derived JSON codec; a minimal in-process Http and Sql capability with deterministic fakes over the existing MIR interpreter; a real runnable multi-tenant CRUD endpoint and the Job library, all before the native backend.
- Phase 3: full capability runtime with deterministic fakes; D9 floats and the exact decimal money type; contract-conformance harness and `lumen serve` hot loop.
- Phase 4: native backend, the < 15 MB binary, and validated latency/throughput targets.
- Phase 5 and later: stdlib breadth, LSP, package manager, and the opt-in `lumen deploy` descriptor emitter.

## 7. Open tensions

These are unresolved and tracked, not hidden. The zero-legacy paradox caps near-term first-try-compile-rate and is bridged only by in-context grounding until the corpus matures. The pinned-tokenizer coupling decays on a 6 to 18 month horizon. The fake-versus-real capability split must be airtight or the replay guarantee leaks. The two performance-critical decisions (D2 memory model, D4 backend) are still open, so the binary-size and sub-second targets are unvalidated. Pulling the SaaS walking skeleton ahead of self-hosting risks entrenching pre-self-host constructs that must later be re-derived; we keep that slice tiny and interpreter-only to bound the risk.
