# Lumen in 2035: the ten-year vision

Status: strategic document, not a spec. This is the honest, ambitious-but-grounded view of where Lumen could be a decade out, written against the project's own design (`docs/MANIFESTO.md`, `docs/spec/SYNTHESIS.md`) and its own honest risks (`docs/RISKS_AND_OPEN_PROBLEMS.md`). It is a north star, not a promise.

## The frame: separate the moonshot from the realistic ceiling

The moonshot, "Lumen becomes the default language AI writes, replacing Python and TypeScript," almost certainly does not happen. Ecosystems and network effects are brutal, and the project's own risk register names the fatal tension: today's models are trained mostly on legacy code, so a zero-legacy language fights the grain of what those models are currently good at. Selling a ten-year vision on world domination would be dishonest.

The realistic best outcome is more interesting and more defensible, and it is three things at once.

## The single best ten-year bet

**Lumen becomes the language AI generates into when correctness must be provable, and its compiler becomes a training environment for code-generating models.** Two reinforcing roles, plus a third that is a win even if the first two stay small.

### 1. The verified substrate for high-assurance, AI-written code

Not all code. The code where "an agent wrote it, and we can prove what it can touch and replay exactly what it did" is worth more than ecosystem breadth: finance and quant systems, smart contracts, infrastructure-as-code, safety-critical control, audited data pipelines. Capabilities-as-the-only-effect, determinism by default, and structured diagnostics are uniquely suited to this, and it is precisely the domain the author already lives in.

### 2. A trainable verifier and reward environment for code models

This is the genuinely novel asset and the strongest part of the thesis. Because every Lumen error is a machine-checkable structured object and every run is deterministic and replayable, the Lumen compiler is a dense, reproducible reward signal. You can reinforcement-train a model against it: generate, get a structured verdict, reward, improve, at scale, with no flaky tests and no ambiguous English errors. In ten years the most valuable artifact may not be Lumen-the-language but Lumen-the-environment that makes code models verifiably better. No mainstream language was built to be a clean reward signal; Lumen was, by accident of its design commitments.

### 3. An idea-exporter

Even if Lumen-the-language stays niche, its ideas propagate: the structured-diagnostic correction loop, capabilities as the single effect mechanism, determinism for replay and time-travel, and "the authorship benchmark gates language changes." These leak into mainstream languages and AI coding tools. The influence outcome is a success even without mass adoption, and it is the floor.

## The three shapes it could take

| Shape | What it means | Likelihood | Value |
|-------|---------------|------------|-------|
| Verified AI substrate + trainable verifier (the goal) | The provable-correctness language agents target, and a reward environment for code models | Plausible | Very high, defensible, on-brand |
| Checkable core in a transpile pipeline | AI writes Lumen as the verified layer; it emits to host platforms (WASM, native, JS) | Likely | High, lower ambition |
| Research standard-setter | The language stays small; its design ideas become how everyone builds AI-coding tools | Most likely | Real, but indirect |

Aim at the first and you land, at worst, on the third, which is still a win.

## The flywheel that has to spin (in order)

1. **Self-hosting.** The compiler is written in Lumen and reproduces itself byte-for-byte. Now it is a real language, not a demo.
2. **Native backend.** Speed stops being a disqualifier (the bootstrap interpreter exists only to bootstrap).
3. **Batteries.** Standard library, package manager, language server, formatter, debugger. Now people can build things.
4. **A Lumen corpus and reinforcement learning against the compiler.** Models become genuinely good at Lumen. This is the keystone, because it is the only thing that resolves the zero-legacy paradox: you stop depending on legacy-trained familiarity and start training the familiarity in.
5. **A beachhead domain.** Verified quant and finance proves value end to end, producing reference users and the beginnings of an ecosystem.

Step 4 is the load-bearing one. Zero-legacy only works long-term if Lumen creates the training data that makes models native to it. That is the bet that has to pay off.

## The five gates that decide it (honest)

1. **Formal semantics and the metatheory triple-point.** The capability times Perceus-ownership times effect-handler invariant must actually be provable (`RISKS` risk 1 and 2). If it is not, the correctness story is marketing. Mechanize it.
2. **The zero-legacy paradox** (`RISKS` risk 3). Resolved only by step 4 of the flywheel, or by deliberately softening the purism. Choose on purpose, not by drift.
3. **Floating point and decimals** (`RISKS` risk 4, decision D9). No serious quant, scientific, or financial adoption without a real number story that preserves determinism. The language today has neither floats nor a resolved cost model for reproducible floating point. Non-negotiable for the beachhead.
4. **Scope** (`RISKS` risk 5). The full system is the union of Rust, Koka, Roc, LiquidHaskell, a record-replay debugger, and a verified bootstrap. AI authorship is the only reason this is conceivable in a decade; without sustained AI-built velocity it stalls.
5. **Sustained authorship.** A language is a decade-long commitment, not a project. It needs to be built continuously, largely by agents, for years.

## 2035, if it works

A small, sound, natively compiled language with a self-hosted toolchain. The thing agents reach for when a system has to be audited and replayed, not merely shipped. A published verifier and reward environment that labs use to train better code models. A real, if focused, ecosystem anchored in verified finance and infrastructure. And a set of design ideas that, by then, everyone building AI coding tools takes for granted. The author is the person who saw, a decade early, that the move was not to teach AI our old languages but to build a language for how AI thinks, and to make its compiler the trainer.

## The wedge to start now

Do not chase generality. Drive toward one provable thing an agent cannot do well in any other language: a deterministic, capability-sandboxed, fully-replayable computation that an LLM writes and that you can prove and re-run to the bit. Concretely:

- Add floats or decimals and a resolved deterministic-number story (decision D9).
- Add `Result` and `match` so real programs and error handling are expressible.
- Get a verified quant kernel working end to end (an agent writes it; the compiler proves its effects; the run replays exactly).
- Stand up the reinforcement-against-the-compiler loop early, even tiny.

That converts the philosophy into the one asset nobody else has: a language whose compiler makes the AI writing it measurably better.

## Where this sits

This document is the destination. `docs/ROADMAP.md` is the path (formal core, then the runnable subset, then the native backend, then self-hosting). `docs/RISKS_AND_OPEN_PROBLEMS.md` is the list of things that can kill it. `docs/MANIFESTO.md` is the why. Read in that order, the project is honest with itself: a generation-ahead idea, a working bootstrap, and a decade of building between here and the vision above.

## The bandwidth thesis: Lumen as the LLM-to-SaaS substrate

Everything above frames Lumen as a verified substrate and a trainable verifier. This section adds a sharper, nearer-term lens that does not replace that bet: Lumen should be the highest-bandwidth substrate for a model, running locally or in the cloud, to author, compile, fix, and ship working B2B SaaS software with the fewest tokens and the tightest local loop. The honest claim is narrow. We are not promising that today's models write Lumen well; they have never seen it. We are promising that the path from a prompt to a compiling, deterministic, deployable service is shorter in tokens and tighter in wall-clock than it is in any legacy stack, and that the gap is measured and gated rather than asserted.

### This is not a fifth commitment, it is how the four are measured

The four commitments already contain the thesis; we are giving them numbers.

- Clarity by construction becomes tokens-per-construct under a pinned tokenizer. A construct that reads clearly and tokenizes cheaply puts more program in a fixed context window. Clarity wins on conflict: we measure lexeme density and review it, we do not let a token-golf gate override the clearer form.
- Debuggability as a language feature becomes warm edit-to-diagnostic latency and the fraction of errors the compiler fixes itself. A confident fix the compiler applies costs the model zero output tokens and zero round-trips. That is the single highest-bandwidth lever in the whole design, and it is already specified as the canonical Diagnostic; it is simply not built yet (the seed emits no diagnostics at all).
- Provable correctness within reach stays scoped. Proof obligations attach where contracts are asserted, so the verified quant kernel pays the discharge cost and ordinary SaaS glue ships on the fast types-plus-effects-plus-capabilities tier. We keep the fail-below-proven semantics; we do not let proof inflate rounds-to-green for code that makes no claims.
- A language that improves from how the AI writes it becomes a third gated metric. Alongside first-try-compile-rate and rounds-to-green, the authorship benchmark now gates tokens-to-green. The held-out and metamorphic shards stay, so the gate measures genuine authorability, never mere legacy-familiarity.

### Where it sits in the flywheel

The flywheel order is unchanged: self-host, then native backend, then batteries, then the Lumen corpus and reinforcement against the compiler, then the beachhead. The bandwidth thesis changes what we build first inside the early phases, not the order of the heavy ones. Three deliverables move forward because they are cheap and load-bearing for the loop: the canonical Diagnostic plus confident fixes, a fully-local warm compiler daemon exposed over MCP, and the LLM accessibility layer (FOR_LLMS.md, a machine-readable spec bundle, `lumen caps --json`, the /lumen skill). These are pure tooling and docs over the existing compiler; they let the reinforcement-against-the-compiler loop run interactively, even tiny, years before the native backend lands. This is exactly the wedge already named: stand up the loop early.

### The interactive loop is the inference-time twin of the reward environment

The earlier vision describes the compiler as an offline reward environment for training. The bandwidth thesis adds its inference-time twin: a long-lived `lumen serve` process that keeps the program model warm and answers check, fix, type, effects, callers, and ast as structured JSON over a local socket, with a span-edit protocol so the model sends a patch (tens of tokens) rather than a whole file (a thousand tokens) each round. Compile is already sub-millisecond, so the bottleneck becomes the model's own latency, not the toolchain. The same daemon meters tokens-in, tokens-out, and rounds-to-green, feeding the authorship benchmark automatically.

### Prompt to B2B SaaS, through one mechanism

The concrete target is the kind of service in docs/b2b_saas_architecture.md: a multi-tenant quant platform with a submit-then-poll job contract over a queue. We reach it without importing a web framework. The single mechanism Lumen already ships, the capability as an ordinary typed parameter, expresses Http, Sql, Queue, Auth, Tenant, and Secret. A function with no capability parameters is provably pure; a handler that omits the Tenant parameter provably cannot touch tenant data, so multi-tenant isolation is a type error rather than a runtime audit. A record auto-derives its deterministic JSON wire codec, closing the serialization dimension. The async job lifecycle is a stdlib sum type, and the worker body is the Result, match, and non-coercing ? operator that already landed. The correctness burden of a SaaS sits exactly where Lumen already has verified constructs.

### The tradeoffs we make on purpose

We are explicit about the costs, because the critics were right to press on them.

- We refuse to bake a vendor async skeleton (Pub/Sub topics, base64 envelopes, a submit/poll dispatcher) into the grammar. That would import a specific cloud pattern as syntax and violate both one-mechanism and zero-legacy. The skeleton is a library over capabilities, inspectable via `lumen ast`, not new keywords.
- We refuse legacy-familiar syntax as a shortcut to first-try-compile-rate. The zero-legacy surface stays. The bridge is in-context grounding: a model that loads the spec bundle authors Lumen far better than one guessing from training priors. If that bridge underperforms its target, the accessibility claim stays aspirational until the corpus and reinforcement loop mature; we will not paper over it with borrowed syntax.
- We do not relabel cloud deploy as self-contained. Self-containment is a build-time property: no networked package manager, no network during compile, a single binary. A deployed service reaches the network through capabilities whose nondeterminism is tainted and quarantined; that is the deploy story, and it does not restore an air-gapped run. `lumen deploy` emits its descriptor as derived data, but it lives outside the self-contained mandate and we say so.
- The determinism contract taxes the fast path. Reproducible-default floats forbid FMA and reassociation, which costs performance. The compute core that needs bit-reproducibility pays it; an explicitly non-recorded edge path can opt into `fast`. The fake-versus-real capability split must be airtight or the loop's reproducibility leaks, so the capability runtime gets its own conformance and adversarial tests.

The bandwidth thesis is therefore the same bet, sharpened: the verified, deterministic substrate is worth most when a model can reach a working, shippable service through it in the fewest tokens and the tightest loop, and when every grammar and diagnostic change is scored on exactly that.
