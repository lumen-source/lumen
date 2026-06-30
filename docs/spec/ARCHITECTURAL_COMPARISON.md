# Comprehensive Research Report: Programming Languages and Execution Engines for Artificial Intelligence

## Executive Summary
As artificial intelligence and Large Language Models (LLMs) transition from static chatbots to autonomous agents, a new class of programming languages, domain-specific languages (DSLs), and runtime engines has emerged. These languages are designed specifically to structure prompts, guide token generation, optimize inference costs, and guarantee schema conformity. 

This report provides a comparative analysis of seven prominent systems in the AI execution space: **LMQL**, **SudoLang**, **Microsoft Guidance**, **DSPy**, **SGLang**, **TypeChat**, and **Outlines**. It explores their core design philosophies, parsing and execution mechanisms, and safety, speed, or structured output constraints.

Finally, we compare these external systems with the **Lumen language model**—our repository's AI-native language design. Unlike external systems that run as host-driven wrapper libraries (often on top of heavy, non-deterministic runtimes), Lumen is designed around a zero-dependency WebAssembly Text bootstrap, a functionally pure stack-based recursion model, unforgeable capability-based security, strict IEEE-754 determinism contracts, and a structured JSON diagnostic feedback loop engineered specifically for autonomous agent self-repair.

---

## 1. Deep-Dive Analysis of External Systems

### 1.1 LMQL (Language Model Query Language)
*   **Design Philosophy**: Developed at ETH Zurich, LMQL treats prompting as a declarative query paradigm. It unifies natural language prompting with procedural code (Python control flow like loops and conditionals) and declarative constraints (specified in a SQL-like `where` clause). This separates the prompt structure from its execution details, mapping text generation directly to program variables (e.g., `[JOKE]`).
*   **Parsing & Execution Mechanism**: LMQL parses queries into a Python AST to extract templates, variables, and constraints. During execution, it runs on a custom **Query Virtual Machine (Query VM)**. When it encounters a generation variable, it invokes the LLM decoder. Rather than evaluating outputs post-generation, the Query VM evaluates constraints *eagerly* at the token-level on a symbolic constraint evaluation tree.
*   **Safety, Speed, & Constraints**: LMQL translates constraint states into a **vocabulary mask** at each decoding step, setting the logits of invalid tokens to $-\infty$. This provides a hard mathematical guarantee of schema compliance (e.g., matching a regex or length limit). Invalid tokens are pruned before generation, preventing wasteful token generation. For black-box APIs (e.g., OpenAI), LMQL utilizes speculative execution and prefix-completion querying to approximate token-level masking.
*   **Citations & Links**:
    *   *Citation*: Beurer-Kellner, L., Fischer, M., & Vechev, M. (2023). Prompting Is Programming: A Query Language for Large Language Models. *PLDI 2023*, 239–251.
    *   *DOI/arXiv*: [https://doi.org/10.1145/3591240](https://doi.org/10.1145/3591240) / [arXiv:2212.06094](https://arxiv.org/abs/2212.06094)
    *   *Repository/Website*: [https://lmql.ai](https://lmql.ai)

### 1.2 DSPy (Declarative self-improving python pipeline compiler)
*   **Design Philosophy**: Developed at Stanford, DSPy replaces fragile, manually engineered prompts with a declarative programming framework. Drawing inspiration from PyTorch, DSPy separates the program's **structure** (control flow and modules) from its **parameters** (the prompts, instructions, few-shot examples, and model weights). Developers define clean signatures (e.g., `question -> answer`) and compose them into modular pipelines.
*   **Parsing & Execution Mechanism**: DSPy compiles declarative modules using optimizers (teleprompters like `BootstrapFewShot`, `MIPRO`, or `COPRO`). Given a small training dataset and an evaluation metric (e.g., LLM-as-a-judge or exact match), the compiler runs the program, traces execution paths, and bootstraps successful runs into few-shot demonstrations. It can also search the space of prompt instructions or fine-tune model weights (e.g., Llama-3) to internalize behavior.
*   **Safety, Speed, & Constraints**: DSPy does not enforce real-time logit masking at runtime. Instead, safety and structural constraints are optimized during compilation by training the model or modifying prompts to maximize compliance with the target metric. Execution speed is optimized by compiling prompt structures down to minimal, fine-tuned weights, bypassing long, few-shot instruction strings.
*   **Citations & Links**:
    *   *Citation*: Khattab, O., et al. (2023). DSPy: Compiling Declarative Language Model Calls into Self-Improving Pipelines. *arXiv preprint*.
    *   *arXiv*: [https://arxiv.org/abs/2310.03714](https://arxiv.org/abs/2310.03714)
    *   *Repository*: [https://github.com/stanfordnlp/dspy](https://github.com/stanfordnlp/dspy)

### 1.3 SGLang (Structured Generation Language)
*   **Design Philosophy**: SGLang addresses the runtime and execution inefficiencies of complex, multi-turn LLM generation and agent pipelines. It separates concerns into a frontend programming language (embedded in Python) for expressing structured generation, control flow, and constraints, and a highly optimized backend runtime engine (SGLang Runtime / SRouter).
*   **Parsing & Execution Mechanism**: Programs compile into execution graphs. The runtime utilizes **RadixAttention**, which keeps KV caches of prompt prefixes (e.g., system prompts, few-shot examples, prior turns) in a radix tree structure in memory. When new requests share prefixes, their KV cache chunks are reused, bypassing the compute-heavy prefill phase. SGLang also supports fork-and-join parallelism to branch and merge execution paths.
*   **Safety, Speed, & Constraints**: Enforces regex, JSON schema, and Context-Free Grammar (CFG) constraints by compiling them into Finite State Machines (FSMs). The backend engine performs logit masking directly on the server. Throughput and latency are minimized due to RadixAttention KV cache sharing, FSM-guided decoding, and static execution graph optimization.
*   **Citations & Links**:
    *   *Citation*: Zheng, L., et al. (2024). Efficiently Programming Large Language Models with SGLang. *MLSys 2024*.
    *   *arXiv*: [https://arxiv.org/abs/2312.07104](https://arxiv.org/abs/2312.07104)
    *   *Repository*: [https://github.com/sgl-project/sglang](https://github.com/sgl-project/sglang)

### 1.4 SudoLang
*   **Design Philosophy**: SudoLang is a declarative programming language designed to be parsed and executed *directly* inside LLMs (referred to as Natural Language Virtual Machines or NLVMs). It merges elements of JavaScript, Python, TypeScript, and functional programming with structured natural language. SudoLang is designed to structure agent instructions, track interactive state, and direct agent actions without a local compiler.
*   **Parsing & Execution Mechanism**: SudoLang requires no local parsing binary. The script is passed directly to the LLM's prompt window, preceded by a bootstrap preamble instructing the model to behave as the SudoLang Virtual Machine (SLVM). The program operates inside the LLM's attention span, often structured as an interactive Read-Eval-Print Loop (REPL).
*   **Safety, Speed, & Constraints**: SudoLang defines explicit constraints, preconditions, and postconditions in syntax (e.g., `constraints { never break character }`). However, because the execution engine is the LLM itself, these constraints are probabilistic ("soft"). SudoLang reduces token drift and logical errors by constraining the LLM to a highly structured state-machine-like syntax, but it cannot prevent model jailbreaks or output formatting failures at the VM level.
*   **Citations & Links**:
    *   *Author*: Eric Elliott.
    *   *Introduction Article*: [SudoLang: A Declarative Language for LLMs (Medium)](https://medium.com/javascript-scene/sudolang-a-declarative-language-for-llms-c22e4ff9f727)
    *   *Repository*: [https://github.com/ericelliott/sudolang](https://github.com/ericelliott/sudolang)

### 1.5 Microsoft Guidance
*   **Design Philosophy**: Guidance allows developers to control token-level generation by interleaving host execution (Python) with LLM token generation. Rather than treating prompts as static text strings, Guidance treats them as a dynamic execution stream where the host program can intervene, run loops, update state, and guide the LLM's next generation step.
*   **Parsing & Execution Mechanism**: Written as a Python-based DSL. The Guidance interpreter runs on the host, managing the active token stream. The interpreter sends text to the LLM, halts generation when a control structure is hit (e.g., choice block or regex end), runs Python logic (e.g., calling APIs or databases), appends results back to the prompt context, and tells the model to resume.
*   **Safety, Speed, & Constraints**: Provides hard mathematical guarantees for structured data (like JSON or regex matching) by calculating valid token transitions and applying logit bias masking directly to the LLM vocabulary. In addition, speed is optimized by injecting formatting characters (like commas, braces, and quotes) directly from the host instead of generating them from the model.
*   **Citations & Links**:
    *   *Creator*: Microsoft.
    *   *Repository*: [https://github.com/guidance-project/guidance](https://github.com/guidance-project/guidance)
    *   *Documentation*: [https://guidance-project.github.io/guidance/](https://guidance-project.github.io/guidance/)

### 1.6 Microsoft TypeChat
*   **Design Philosophy**: TypeChat is designed to integrate LLMs into traditional TypeScript/Node.js application backends by utilizing TypeScript type definitions as the single source of truth for schema validation. Instead of crafting complex prompt instructions to request JSON structures, developers define standard TypeScript interfaces as the execution contract.
*   **Parsing & Execution Mechanism**: TypeChat embeds the TypeScript interface definitions into the LLM system prompt, requesting a JSON object that satisfies the type. Upon receiving the response, the host runs it through the TypeScript compiler and validator API. If the output violates the schema, TypeChat initiates a post-generation validation and self-repair loop, passing the compiler error logs back to the LLM to request a correction.
*   **Safety, Speed, & Constraints**: TypeChat does not modify logits at the inference level, resulting in soft constraints during generation. However, it guarantees type safety to the parent application because it will not return a value unless it passes validation. The key limitation is latency: if the model returns malformed JSON or type errors, multiple multi-turn repair cycles may be required, which increases execution time and API costs.
*   **Citations & Links**:
    *   *Creator*: Microsoft.
    *   *Website*: [https://microsoft.github.io/TypeChat/](https://microsoft.github.io/TypeChat/)
    *   *Repository*: [https://github.com/microsoft/TypeChat](https://github.com/microsoft/TypeChat)

### 1.7 Outlines
*   **Design Philosophy**: Developed by Normal Computing (now .dottxt), Outlines frames LLM structured generation as a formal language parsing problem in reverse. It decouples structural constraints from the underlying model backend, compile schemas (regular expressions, JSON schemas, or CFGs) into Finite State Machines (FSMs) or parsers, and uses them to guide the generation path.
*   **Parsing & Execution Mechanism**: Outlines pre-indexes the model's vocabulary against the transition states of the compiled schema FSM. At each step of the token generation loop, the engine identifies the active FSM state, retrieves the set of valid next tokens, and masks out invalid token logits.
*   **Safety, Speed, & Constraints**: Outlines guarantees regex and JSON schema alignment on the first pass (hard constraints). It has zero retry overhead and increases inference speed by reducing the model's search space. It interfaces directly with local inference engines (Hugging Face, vLLM, llama.cpp).
*   **Citations & Links**:
    *   *Creator*: Normal Computing / .dottxt.
    *   *Repository*: [https://github.com/outlines-dev/outlines](https://github.com/outlines-dev/outlines)
    *   *Documentation*: [https://outlines-dev.github.io/outlines/](https://outlines-dev.github.io/outlines/)

---

## 2. Comparative Matrix Table

The following matrix table summarizes the seven external AI execution frameworks and languages:

| Project Name | Creator/Reference | Purpose | Self-Hosted/AI-Designed | Key Optimization | Key Limitation |
| :--- | :--- | :--- | :---: | :--- | :--- |
| **LMQL** | ETH Zurich | Declarative queries & logit constraints | No | Eager token-level logit masking | High integration overhead; limited black-box API support |
| **DSPy** | Stanford NLP | Self-improving prompt/weight pipelines | No | Automated prompt bootstrap & parameter tuning | Requires evaluation dataset; no native runtime logit constraints |
| **SGLang** | UC Berkeley / Stanford | High-throughput structured agent execution | No | RadixAttention (KV cache sharing) & FSM decoding | Backend-runtime dependency; complex server setup |
| **SudoLang** | Eric Elliott | Prompt-native state control and REPL | Yes | No compiler dependency; LLM parses syntax natively | Probabilistic (soft) constraint enforcement |
| **Guidance** | Microsoft | Interleaved prompt control flow | No | Interleaved host execution & logit bias constraints | Bound to host-side Python process; API limits |
| **TypeChat** | Microsoft | TypeScript type-safe schema parsing | No | TypeScript type definitions as schema contracts | High latency & token cost if feedback repair loop repeats |
| **Outlines** | Normal Computing / .dottxt | Guided text generation & regex schemas | No | Index-based token masking via FSM/CFG parsers | Requires access to model logits; parser compilation startup cost |

---

## 3. Comparative Analysis: External Designs vs. Lumen

Unlike the external systems reviewed above, which act as host-language libraries (Python or TypeScript) or prompt wrapper conventions to control third-party LLMs, **Lumen** is an independent, self-contained, AI-first programming language. It is optimized for how LLMs reason, write, compile, and repair code. Below is a detailed architectural comparison between the external designs and the Lumen language model.

### 3.1 Zero Legacy Bootstrap
*   **External Designs**: All seven external frameworks depend on massive legacy software stacks. For example, DSPy, SGLang, and Outlines require Python, PyTorch, C++ compiler chains (for tokenizers/bindings), and package managers (`pip`, `conda`). TypeChat requires Node.js, npm, and the full TypeScript compiler. These layers introduce significant dependency bloat, compilation latency, and security vulnerabilities.
*   **Lumen Model**: Lumen implements a strict **Zero Legacy** bootstrap model. The compiler, interpreter, formatter, and standard library contain no C, C++, Rust, Python, or Go dependencies. Instead, it bootstraps from a minimal WebAssembly Text (WAT) substrate:
    *   `seed.wat` (Stage-0 Interpreter): A hand-written WebAssembly stack machine.
    *   `lumenc.wat` (Stage-0 Compiler + Interpreter): Written entirely in WAT. It parses Lumen-mu source text, generates Lumen-mu bytecode in WASM linear memory, resolves forward call references, and executes it.
    *   **Self-Hosting Fixpoint**: The compiler eventually compiles itself into native WASM bytecode, discarding the WAT seed and achieving a 100% self-contained loop that can run on an air-gapped machine.

### 3.2 Recursion-Based Model
*   **External Designs**: The execution model of external frameworks relies on host-side imperative loops, async event loops, or state-machine wrappers. They track LLM generation history via dynamic list appends, memory buffers, or database logs.
*   **Lumen Model**: Lumen features a mathematically formal, purely functional recursion-based execution model. 
    *   **Purity & Stack Execution**: Functions are pure by default. Control flow and state tracking are handled via stack-based recursion.
    *   **Dual-Stack Architecture**: The virtual machine uses two distinct stacks:
        *   *Operand Stack*: Stores 64-bit integer values (`i64`) starting at byte address 1024.
        *   *Call Stack*: Stores activation frames as `(return_pc, prev_argbase)` u32 pairs starting at byte address 9216.
    *   **Stack Frame Layout**: Parameters occupy slots `[0, nparam)` on the operand stack. Let-locals occupy slots `[nparam, nparam+nlocal)`. Activation frames are initialized using `RESERVE` on entry and cleaned up on `RET`, pushing the return value onto the caller's operand stack. This clean, stack-based structure is easily mapped, understood, and written by LLMs, eliminating complex state management bugs.

### 3.3 28 Bytecode Operations
*   **External Designs**: External frameworks must manage massive natural language vocabularies (e.g., Llama's 32,000 tokens or GPT-4's 100,000 tokens) and parse complex, unstructured natural language strings. This large state space makes reasoning about execution paths probabilistic and error-prone for AIs.
*   **Lumen Model**: The Lumen-mu IR specification defines a minimal, highly regular, and unambiguous set of **28 bytecode operations** (with 15 currently implemented in the Stage-0 `lumenc.wat` compiler/interpreter: `HALT`, `PUSH`, `GETARG`, `ADD`, `SUB`, `LT`, `JZ`, `JMP`, `CALL`, `RET`, `PRINTINT`, `MUL`, `DIV`, `RESERVE`, and `SETLOCAL`).
    *   This minimal instruction set reduces the search space of the programming language. Rather than dealing with natural language ambiguities or massive token maps, the AI writes code targeting a compact instruction set. The syntax is designed to be highly regular, preventing delimiter-matching mistakes.

### 3.4 Manual Memory Mapping
*   **External Designs**: External runtimes utilize dynamic heaps, garbage collection, or virtual memory mapping managed by the operating system and language runtimes (e.g., Python's memory manager or V8's GC). The memory layout is hidden from the programmer and the LLM, making it impossible for the AI to reason about memory footprint or execute precise low-level manipulations.
*   **Lumen Model**: Lumen utilizes a flat, explicitly segmented WebAssembly linear memory layout. In the Stage-0 compiler and interpreter, the memory zones are mapped manually as follows:
    *   `[0 .. 1024)`: Scratch registers and VM pointers (`$osp`, `$csp`, `$argbase`).
    *   `[1024 .. 9216)`: **Operand Stack** (8 KB, 1024 `i64` slots).
    *   `[9216 .. 11264)`: **Call Stack** (2 KB, 256 activation frames).
    *   `[11264 .. 11328)`: **itoa Buffer** (64 bytes, decimal formatting buffer).
    *   `[11328 .. 20000)`: **CODE Region** (8.6 KB, stores emitted IR instruction words).
    *   `[20000 .. 30000)`: **SRC Region** (10 KB, contains raw source bytes).
    *   `[30000 .. 50000)`: **TOKENS Region** (20 KB, stores 12-byte token structures).
    *   `[50000 .. 51000)`: **SYMBOLS Table** (1 KB, stores 12-byte compiled function metadata structs).
    *   `[51000 .. 51500)`: **PARAMS Table** (500 bytes, stores active function parameter metadata).
    *   `[51500 .. 52000)`: **LOCALS Table** (500 bytes, stores active function local metadata).
    *   `[52000 .. 52073]`: **Keyword Literals** (data segment holding string bytes for keywords).
    *   `[53000 .. )`: **Call Fixups Table** (unresolved forward call metadata).
    *   This strict, static mapping allows an LLM to inspect, read, and write memory values directly. The AI can reason about physical address bounds, avoiding buffer overflows and heap corruption by design.

### 3.5 Safety, Determinism, and LLM Feedback Loops
*   **External Designs**:
    *   *Safety*: Enforce safety via prompt guidelines (e.g., SudoLang constraints) or external sandboxing. Jailbreaks and prompt injections can bypass these soft controls.
    *   *Determinism*: External LLM systems are inherently non-deterministic. Variances in API latency, temperature sampling, and server-side float calculations (due to thread scheduling or GPU reductions) result in flaky, non-reproducible execution paths.
    *   *Diagnostics*: Return raw text errors (e.g., Python stack traces or TypeScript syntax warnings) that the LLM must parse using heuristic regexes or multi-turn prompt engineering.
*   **Lumen Model**:
    *   **Capability-based Safety**: Lumen implements a formal `lambda-cap` calculus where side effects are governed by unforgeable, scope-bounded capabilities passed explicitly as function parameters. There is no ambient authority (e.g., global network or filesystem access), ensuring strict sandboxing.
    *   **Determinism Contract**: The compiler enforces a strict determinism contract: all sources of non-determinism (time, random, environment) are capability-gated. It enforces strict IEEE-754 floating-point math (e.g., canonical NaN bit patterns, no optimizer reassociation, pinned custom `libm`), and counts SMT solver instantiations or execution fuel rather than wall-clock time. This guarantees that a program runs identically on any hardware substrate.
    *   **Structured JSON Diagnostics & Self-Repair**: Rather than unstructured text, Lumen emits structured, schema-versioned JSON objects. Each diagnostic includes error codes, severity levels, precise byte spans, and auto-fix edits:
        ```json
        {
          "schema_version": 1,
          "code": "E0102",
          "severity": "error",
          "span": { "file": "main.lm", "start_byte": 142, "end_byte": 147 },
          "args": { "expected": { "type": "Int" }, "actual": { "type": "Text" } },
          "fixes": [
            {
              "tier": "auto",
              "title": "wrap with to_int",
              "edits": [
                { "span": { "start_byte": 142, "end_byte": 142 }, "insert": "to_int(" },
                { "span": { "start_byte": 147, "end_byte": 147 }, "insert": ")" }
              ]
            }
          ]
        }
        ```
        This feeds the **Generate-Check-Fix Flywheel**: the LLM reads the JSON diagnostic, applies auto-fixes programmatically, or modifies the exact code span, avoiding the trial-and-error loop typical of other systems.
    *   **Telemetry-Driven Optimization**: Lumen tracks opt-in authoring telemetry (rounds-to-green, compile rates, token footprint) against a versioned `CLAUDE_CAPABILITY_PROFILE.md`. Language changes are evaluated against this benchmark; if a change increases compilation cycles or prompt token overhead for the AI, it is rejected.

---

## 4. Conclusion
The programming languages designed for AI execution represent two distinct directions. 

On one side, external frameworks like SGLang, Outlines, Guidance, and LMQL optimize the interface to traditional, heavy, non-deterministic LLMs using token-level logit masking or KV cache caching. They act as library wrappers that operate on top of legacy runtimes, aiming to enforce structure on probabilistic foundation models.

On the other side, Lumen represents a radical departure: an **AI-first language designed from the ground up to run on minimal, deterministic substrates**. By pairing a zero-dependency WebAssembly Text bootstrap, stack-based recursion, explicit memory segments, capability-gated sandboxing, and structured JSON compiler feedback, Lumen establishes a robust platform for self-hosted AI execution. Rather than patching non-deterministic models with runtime wrappers, Lumen builds a deterministic, safe, and verifiable sandbox where LLMs can generate, compile, and run code with absolute mathematical confidence.
