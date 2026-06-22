# Lumen stage-0 seed (working)

This is the first running piece of Lumen. It is a bytecode interpreter for the Lumen-mu IR, written in WebAssembly text (`seed.wat`). WebAssembly is a compilation substrate (a target, not a high-level language), so this honors the zero-legacy commitment. The seed is disposable: it exists only to run the Lumen-mu compiler once, and is discarded at the self-hosting fixpoint (see `ARCHITECTURE.md`).

## Status: runs

```
$ npm install      # one-time: fetches wabt (a WAT assembler, a dev tool, not a Lumen dependency)
$ node run.mjs
55
PASS: fib(10) on the Lumen-mu seed => "55\n"
```

`run.mjs` assembles `seed.wat`, writes a Lumen-mu IR program into the seed's linear memory, and calls `run(main_entry)`. The single host import `console_print` is the `Console` capability seam (the only nondeterminism boundary). The program executed is `mu/examples/fib.lm` hand-lowered to bytecode (`fib.lmir`), exercising recursion, branching, integer arithmetic, argument access, calls with a return stack, and the seam.

## What the seed implements now

The integer and control-flow core of the Lumen-mu IR: `HALT PUSH GETARG ADD SUB LT JZ JMP CALL RET PRINTINT`, with an operand stack, a separate call stack for recursion, and deterministic decimal printing. This is enough for the recursive integer subset (fib-class programs).

Not yet implemented (the next increment toward running the full `mu/examples/`): boxed/refcounted values, `Text`, sum and record construction (`make.sum`/`make.rec`/`proj`/`tag`/`switch`), and `Result`/`try`. `safe_div.lm` and `propagate.lm` need those and will run once the value representation lands. This is tracked honestly; the seed grows opcode by opcode, each gated by the conformance suite.

## Why this matters

It proves the bootstrap substrate end to end on real hardware: a program in the Lumen-mu IR runs deterministically on a pinned WASM engine through a single recorded seam, with no legacy high-level language anywhere in the path. The next milestone is to extend the value representation, then to write the Lumen-mu compiler in Lumen-mu and run it on this seed.
