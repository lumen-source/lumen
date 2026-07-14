# Data Rights and Corpus Instrumentation

Status: DRAFT for the maintainer's review. This is a project policy draft, not legal advice.

## Overview

Lumen's business strategy (OPEN_SOURCE_AND_BUSINESS.md, section 10) identifies "corpus and trace
instrumentation on from day one, with a clear data-rights notice" as a decision to settle before
the public launch. This document describes what data the project collects, what it does not collect,
and how that data supports the project's long-term vision. It is written for contributors and
deployed-system operators, so they understand what data leaves their machines and why.

## What data is collected

### 1. Conformance programs and benchmark artifacts

The `bench/` directory holds the measurement infrastructure: the honesty-gate harness, the ULP
diff, the timing rig, the compiler-speed rig, reference vectors, and the DASHBOARD scoreboard.
The authorship benchmark that will produce measured outcomes is described in AI_FEEDBACK_LOOP.md
section 3; as that and the prompt-to-green rig accumulate results, those artifacts live here too.
Whatever is committed here is public, version-controlled, and part of the Apache-2.0 license: it
represents the standard of what correct Lumen looks like, and every change is measured against it.

### 2. Forge-generated corpus

Every program that is committed to the repository that is written in Lumen (whether authored by
hand or generated) becomes part of the corpus under Apache-2.0. This includes examples, test
programs, conformance tests, and the standard library. The corpus is the open-source training
signal that allows future models and agents to author Lumen well. It is not kept private; it is
the core asset of the project and is intentionally public.

### 3. Authorship telemetry (opt-in, aggregate only)

During local authoring and testing, the toolchain can record signals that indicate authoring
friction: diagnostic-code frequencies, compile-fix cycle counts, construct names that were edited
repeatedly, and token-efficiency metrics (AI_FEEDBACK_LOOP.md, section 2.1). These signals are
local-first and opt-in. By default, only aggregate, non-identifying statistics leave the machine.
For example: "diagnostic E0210 fired 15 times in this session; the construct list-map took 3
edit rounds to compile." No source code is included unless the author explicitly shares a
minimized reproduction (AI_FEEDBACK_LOOP.md, section 2.3).

The purpose is to drive the language-improvement loop: friction data is aggregated, ranked, and
mapped to diagnostic improvements, stdlib additions, or language changes (AI_FEEDBACK_LOOP.md,
section 4), so the language gets steadily easier to author over time.

## What data is NOT collected

Source code is never exfiltrated from a developer's or deployed system's machine without explicit
consent. If a bug report or performance investigation requires sharing source, the author must
participate in creating a minimized reproduction. This is the "local-first" commitment
(AI_FEEDBACK_LOOP.md, section 2.3): the language can be used entirely offline, and using it
online does not require shipping code to a central service.

Deployed Lumen services (via Lumen Cloud, if and when launched) may collect input/output telemetry
for observability and billing. That is a separate service-level policy and is not part of this
corpus and language-design instrumentation.

## How data feeds the project

The corpus and telemetry drive two loops:

### The community loop

Public corpus (committed examples and benchmarks) allows any model, not just one vendor's, to
author Lumen well. It is the mechanism by which Lumen becomes universally adoptable instead of
locked to one model or one vendor (VISION_2035.md, section "Used by everyone").

The same open-source commitment is stated in OPEN_SOURCE_AND_BUSINESS.md section 3: "Open source
means more humans and more agents write Lumen, which grows the corpus and the reinforcement-learning
traces, which is exactly what makes the reward environment (the largest pillar) valuable and makes
models better at Lumen."

### The reward-environment loop

Authorship telemetry (friction data) drives the language-improvement loop
(AI_FEEDBACK_LOOP.md, section 4). Aggregate friction is triaged into high-impact improvements:
diagnostics, stdlib, tooling, or language changes that measurably reduce authoring friction for
the next iteration. The effect is measured by re-running the authorship benchmark: per AI_FEEDBACK_LOOP.md
section 3.1, a proposed change that lowers the first-try compile rate or raises mean
rounds-to-green for the pinned model is flagged in review. This is the feedback loop that keeps
the language tuned to actual agent experience.

The telemetry also feeds the larger business vision: a Verify oracle and a hosted reinforcement
environment for frontier labs (VISION_2035.md, "The economic engine", pillar 1). Labs willing to
provide data on how their models perform authoring Lumen get access to the verifier and the
traced benchmark outcomes, which in turn makes their models better. The loop compounds: more
models use Lumen, more traces accrue, the verifier and the corpus get stronger, adoption grows.

## Contributor summary

By contributing to Lumen, you understand that:

- The code and examples you commit become part of the public corpus under Apache-2.0 and may be
  used to train models and agents that author in Lumen.
- If you use local tooling that collects authorship telemetry (opt-in aggregate friction data),
  that data may be sent to the project maintainers, but only in aggregate form and never including
  your source code unless you explicitly share a minimized reproduction.
- You may inspect, disable, or audit this instrumentation at any time; Lumen's development is not
  contingent on any particular telemetry being enabled.
- The project's business strategy (verified finance, Lumen Cloud, the Verify oracle) depends on
  a corpus and verifier that are defensible, trustworthy, and built in the open. Your contribution
  to the open corpus and the telemetry that drives language improvement is what makes that possible.

## TODOs for the maintainer

- [ ] **Trademark filing.** "Lumen" and the certification mark must be reserved and owned before
  the public launch, never in the code license. See OPEN_SOURCE_AND_BUSINESS.md, section 10 item 3.
- [ ] **Service-level privacy policy.** Once Lumen Cloud is launched, a separate service-level
  privacy policy covers input/output telemetry, retention, and opt-out. This document does not
  cover the hosted service; it covers the open-source language and its local tooling.
- [ ] **Telemetry audit.** Review the exact telemetry collection paths in the toolchain (compiler,
  LSP, formatter, debugger) to ensure they are opt-in and aggregate-only by default, and that
  source code cannot be exfiltrated without explicit user action. (This is part of Phase 1 or 2
  implementation.)
- [ ] **Legal review.** Have a legal counsel familiar with open-source licensing review this
  document before public launch to ensure it is accurate and defensible, and to align it with any
  CLA or DCO language.
