# The Lumen Manifesto

## All for AI, all by AI

Lumen is a programming language built **for** artificial intelligence and **by** artificial intelligence. That is not a tagline; it is the design constraint from which every other decision follows.

Every programming language in wide use today was designed for a human typing on a keyboard, in an era when humans wrote nearly all code. Their syntax, their conventions, their accumulated quirks, and their backward-compatibility burdens all encode that assumption. We are now in a different era: a large and growing share of code is written by language models, and that share will only rise. Lumen is the language for that era, designed from nothing, owing nothing to the past.

## Zero legacy

Lumen inherits nothing by default. No syntax, no convention, no semantic, and no toolchain dependency carries over from C, C++, Java, Python, JavaScript, Go, Rust, or any other prior language simply because it is familiar. Familiarity is a human value, and a fading one. Every idea, even a good one borrowed from an existing language, must re-earn its place on a single test: does it make the language better to be written by AI, and better to be debugged by AI? If the only argument for a feature is "that is how it has always been done" or "humans expect it," the feature is rejected.

This applies to the toolchain itself. No legacy high-level language is part of Lumen's identity or its shipped tools. The compiler, the standard library, the formatter, the language server, the debugger, and the package manager are written in Lumen. The single unavoidable bootstrap seed targets a low-level substrate (a compilation target such as WebAssembly or LLVM IR, not a programming language) and is discarded the moment Lumen can compile itself. Lumen stands on its own.

## 100% self-contained (mandatory)

**The Lumen toolchain must be 100% self-contained. This is not an aspiration; it is a hard requirement, and it is the operational form of zero legacy.** Self-containment is what buys maximum freedom: a thing that depends on nothing outside itself cannot be broken, gated, deprecated, rate-limited, relicensed, or steered by anyone else. It is portable to any machine, auditable in full, reproducible to the byte, and free to evolve on its own schedule. Freedom is owing nothing.

What this forbids, with no exceptions, in the shipped toolchain and on the path to it:

- **No scaffolding in another language.** The compiler, and any program that helps build or run it, may not be written in Python, JavaScript, Rust, C, or any other language. A "self-hosted" compiler that is propped up by a Python writer or a JavaScript driver is not self-hosted and is not Lumen. Such an artifact is rejected on sight.
- **No external package managers or networked dependencies.** No `npm`, `pip`, `cargo`, `npx`, or any dependency fetched from a registry. No network access during build or run of the toolchain. The toolchain ships as itself, complete.
- **No external assembler, formatter, runtime, or build tool** that is not part of Lumen. The formatter, the test runner, the debugger, the package manager: all are Lumen, all ship in the box.

The single permitted exception, and it is irreducible: the **execution substrate** that runs the very first seed (a WebAssembly engine or a machine ISA). Producing executable code is the one thing a compiler cannot do without a target. That substrate is named explicitly in the trusted computing base, kept as small as possible, and discarded at the self-hosting fixpoint. A substrate is a target, not a dependency in the sense that matters here.

Bootstrap scaffolds (a throwaway WAT seed, a temporary host harness) are tolerated only while they are **disposable and clearly labeled as such**, and only until self-hosting replaces them. They are never committed as if they were the real artifact, never relied upon by the shipped toolchain, and never allowed to become permanent.

The test is one question: **could this toolchain be built and run, end to end, on an air-gapped machine that contains nothing but Lumen itself and its named substrate?** If the answer is no, it is not self-contained, and it is not done.

## The four commitments

Everything in Lumen is required to serve these four commitments. They are the standard against which any proposed feature is judged.

1. **Clarity by construction.** One canonical way to express each idea. A small, regular, unambiguous grammar that an AI almost never gets wrong and a human can always read. One mandatory formatting, so the same intent always produces the same text. No null, no implicit coercion, no hidden control flow, no two ways to say one thing.

2. **Debuggability as a language feature.** Every error is a structured object an agent can read and often fix automatically. Execution is deterministic by default, so any bug can be reproduced. The runtime can replay a run, step backward through it, and answer where any value came from. What a function can touch is written in its type. Nothing happens in the dark.

3. **Provable correctness within reach.** The language gives an AI the tools to write code that demonstrates it is right: a sound static type system, exhaustive case analysis, explicit effects, contracts, and machine-checkable properties. Correctness is something the compiler helps establish, not something left to hope.

4. **A language that improves itself from how the AI writes it.** As Claude and other agents write Lumen, their experience is captured as structured feedback and measured against an authorship benchmark. Any change that makes the language harder for the AI to author correctly is treated as a regression. Lumen is continuously tuned to the capabilities of the models that write it, and re-tuned as those models change. The language and its authors improve together.

## Why this matters

A language designed around how AI actually writes and reasons about code can close the loop between intent and correct program faster and more reliably than any language retrofitted for AI use. The same properties that make Lumen safe and legible for a model to write (regular syntax, structured errors, determinism, explicit effects, provable correctness) make it clear and predictable for a human to own. Designing for AI does not abandon humans; it produces a language that is simply clearer for everyone, because clarity is the shared requirement.

Lumen is the bet that the right move is not to teach AI our old languages, but to give it a new one built for how it thinks.
