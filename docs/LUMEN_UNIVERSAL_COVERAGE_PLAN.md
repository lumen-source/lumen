# Lumen Universal Coverage Plan
### The fastest prompt-to-green, fastest-compiling, fastest-executing language for all of mathematics

This is an execution plan, not a vision doc. It is written to be ground through at high volume: every
domain is a self-contained work package with a defined scope, an honest baseline to beat, an accuracy
contract, concrete benchmark tasks, numeric KPIs, and a machine-checkable honesty gate. Do the work in
any order the dependency graph allows; parallelize freely. Do not skip Section 1 or Section 2 — they are
what make the token-burn produce real coverage instead of gamed demos.

---

## 0. Mission and the three "fastest" pillars

Lumen must become, simultaneously and provably:

- **Pillar A — Fastest prompt-to-green.** For any task, an LLM reaches a correct, test-passing program in
  Lumen in fewer rounds and fewer tokens than in any other language, on the same model. This is the
  headline differentiator and the hardest to fake, so it gets the most rigorous measurement.
- **Pillar B — Fastest compiler.** Lowest edit-to-error latency and highest compile throughput of any
  compiled language. Target: sub-millisecond incremental compile, so the prompt-to-green loop is
  bounded by model latency, not tooling.
- **Pillar C — Fastest process (execution).** Native code that meets or beats the honest reference
  implementation in every math domain, at a declared accuracy, produced BY the Lumen compiler.

A claim on any pillar is worthless without the number that proves it and the honesty gate that certifies
the number is real. Every deliverable below ends in a committed, runnable benchmark that prints the KPI.

---

## 1. Honesty gates — non-negotiable, read before writing any code

Two prior "Lumen beats C" attempts were false: one used a strawman baseline, the other spliced a
hand-written NEON kernel (with the benchmark's option constants baked in) into the emitted C via a host
regex and mislabeled it as Lumen output. Both printed great numbers. Neither was real. These gates exist
to make that impossible. A deliverable that violates any gate is rejected regardless of its number.

- **G1 — No host-side codegen.** The winning implementation must be Lumen source (`.lm`) compiled by the
  Lumen toolchain (seed/`emit_fn.lm`/`optimize.lm`) to IR to native. It must NOT be C, assembly, or
  intrinsics hand-written in a host file (`.mjs`, `.py`, `.js`) and injected by string/regex surgery.
  Check: the winning hot loop's instructions must trace to the Lumen compiler's emission. If you delete
  the injection code in `pipeline.mjs` and the number collapses, it was never Lumen's number.
- **G2 — No baked inputs.** A kernel must read every parameter from the program or its data. It may not
  hard-code the benchmark's specific values (e.g. `S=100, K=100, r=0.05`). Check: re-run each benchmark
  with randomized inputs drawn over the domain; the output must match the reference for all of them, not
  just the canonical case.
- **G3 — Honest baselines.** The comparison baseline is the idiomatic, competently-written standard
  implementation for that domain (NumPy/SciPy, reference BLAS/OpenBLAS, libm, FFTW, GMP/MPFR, the
  language's own stdlib). Never a deliberately-crippled strawman. Both sides use the same algorithm and
  the same accuracy target. If you also compare against a hand-tuned expert baseline (e.g. SIMD C), report
  that number too; never beat only the weak baseline and call it a win.
- **G4 — Accuracy-gated speed.** Every speed number is reported next to an accuracy number: max-ULP (and
  p99-ULP) versus a high-precision reference (mpmath/MPFR at >= 113 bits, rounded to the target type), or
  exactness for integer/exact domains. A faster wrong answer is a failure. State the ULP bound the domain
  is gated at; a result outside the bound does not ship.
- **G5 — Reproducibility.** Every benchmark is a committed, runnable harness: spawn-subtracted, median of
  >= 5 runs, documented hardware and flags. No hand-quoted numbers in any report; the harness prints them.
- **G6 — Coverage, not cherry-pick.** A domain counts as "covered" only when the benchmark tasks span the
  domain's standard operation set (defined per domain below), each individually gated. One fast op is not
  a covered domain.
- **G7 — Evidence for SIMD/parallel claims.** For any "vectorized"/"beats C via SIMD" claim, dump the
  emitted assembly and show the vector instructions (`.2d`, `fmla v*.2d`, etc.), AND show they originate
  from the Lumen compiler's emission (G1), AND that the loop reads its data from memory (G2).
- **G8 — Property-based differential testing.** Each Lumen operation is differentially tested against the
  reference over thousands of randomized inputs across the domain's valid range, including edge cases
  (0, inf, nan, subnormals, extreme magnitudes), not just a fixed vector. Record the max observed error.

Enforcement: build these as an automated harness (`bench/honesty_gate.mjs`) that every domain benchmark
must pass to be marked done. This harness is Work Package 0 and blocks all "beats X" claims.

---

## 2. Measurement infrastructure — build this first (Work Package 0)

Nothing downstream is falsifiable until these exist. Build, commit, and gate them before domain work.

1. **`bench/reference/` — the ground truth.** A `uv run --with mpmath,sympy,numpy,scipy python3`
   generator that, per domain, emits committed reference vectors: inputs plus correctly-rounded outputs
   at >= 113-bit precision (mpmath/MPFR/SymPy for exact). Deterministic, offline, no network at build.
2. **`bench/ulp_diff.mjs` (and exact-diff for integer domains).** Exact ULP distance between a candidate
   value and the reference; reports max, p99, mean, and the worst input. Handles sign, zero, subnormals.
3. **`bench/harness.mjs` — the timing rig.** Spawn-subtracted, median-of-N, warmup, documented hardware
   and clang flags. Prints ops/sec (or GFLOP/s, prices/sec, etc.) and the paired accuracy number.
4. **`bench/promptgreen/` — the rounds-to-green rig.** For a frozen task, run a fixed model against
   Lumen and against each control language (Python, Rust, Julia, C) with identical prompting; record
   rounds-to-green, tokens-to-green, one-shot-green rate. Deterministic seeds; log every round.
5. **`bench/compiler_speed.mjs`.** Cold-compile latency (ms), incremental-compile latency (ms),
   edit-to-first-error latency (ms), compile throughput (kLOC/sec), across program sizes.
6. **`bench/honesty_gate.mjs` (from Section 1).** Runs G1-G8 on a domain's deliverable; pass required to
   mark done.
7. **`bench/DASHBOARD.md` — the single scoreboard.** Auto-generated table: per domain, per pillar, the
   current number, the baseline, the ratio, the accuracy, and pass/fail on each gate. This file is the
   definition of progress. Update it on every merged deliverable.

---

## 3. Domain coverage map — the work

Each domain is a work package. Template for every one:

> **Scope** (the operation set that defines coverage) - **Replaces** (languages/libraries this steals
> from) - **Baseline to beat** (the honest reference, per G3) - **Accuracy contract** (per G4) -
> **Benchmark tasks** (concrete, gated programs) - **KPIs** - **Honesty gate specifics** - **Deliverables**
> (Lumen stdlib modules + tests + benchmarks that print the KPI).

Domains are grouped in tiers by how hard the incumbent is to beat. Be honest per G3: for mature,
decade-tuned incumbents (OpenBLAS, FFTW), the realistic target may be parity or a win only on
specialized/fused/small-size cases; state where Lumen wins and where it reaches parity, and never claim a
general win from a narrow one.

### Tier 1 - Numerical core (incumbents: C, Fortran, libm, BLAS/LAPACK, FFTW)

**D1. Elementary and special functions.**
- Scope: exp, log, log1p, expm1, pow, sqrt, cbrt; sin/cos/tan and inverses; sinh/cosh/tanh; erf, erfc;
  gamma, lgamma, beta; Bessel J/Y/I/K; the standard `math.h` + Cephes/SLEEF set.
- Replaces: libm, Cephes, SLEEF, numpy ufuncs.
- Baseline: scalar libm (the honest per-call loop) and, as a stretch expert baseline, SLEEF vectorized.
- Accuracy: <= 1 ULP for the core set on the full valid range; state per function. Certify via mpmath.
- Benchmark tasks: (a) accuracy sweep vs mpmath over a dense grid per function; (b) throughput of a
  `map` of each function over a 2M-element array. Both gated by G2 (data-driven, not baked).
- KPIs: max-ULP per function; elements/sec vs scalar libm; ratio to SLEEF.
- Gate specifics: G7 (the map must emit vector instructions from the Lumen compiler); G8 (edge cases).
- Deliverables: `std/math/*.lm` minimax kernels (range-reduced, FMA, branchless via select), the accuracy
  sweep, the throughput benchmark, DASHBOARD rows.

**D2. Dense linear algebra.**
- Scope: gemv, gemm; LU, QR, Cholesky, SVD, eigen(sym/gen); triangular solve; determinant, inverse,
  condition number; norms. The BLAS-3 + core LAPACK set.
- Replaces: BLAS/LAPACK, Eigen, numpy.linalg, MATLAB.
- Baseline: reference BLAS AND OpenBLAS (honest: OpenBLAS is decade-tuned; expect parity-on-small,
  win-on-fused, state it). Same accuracy target both sides.
- Accuracy: exact algorithm, results within standard backward-error bounds of the reference; matmul
  gated to <= a few ULP element-wise vs a high-precision accumulation reference.
- Benchmark tasks: gemm at sizes {8,64,256,1024}; a batched-small-gemm (where fused codegen can win);
  Cholesky/QR/SVD correctness + speed at those sizes; a solve.
- KPIs: GFLOP/s per size vs OpenBLAS; element-wise ULP; where Lumen wins vs reaches parity (explicit).
- Gate specifics: G3 (must include OpenBLAS, not just reference BLAS); G6 (all listed ops, not just gemm).
- Deliverables: `std/linalg/*.lm` (blocked, register-tiled, SIMD gemm; the decompositions), benchmarks.

**D3. Sparse linear algebra.**
- Scope: CSR/CSC/COO formats; spmv; sparse triangular solve; iterative solvers CG, BiCGSTAB, GMRES with
  preconditioners (Jacobi, ILU).
- Replaces: SuiteSparse, scipy.sparse, Eigen sparse.
- Baseline: scipy.sparse / SuiteSparse on the same matrices.
- Accuracy: solver residual <= tol; spmv exact-order-gated.
- Benchmark tasks: spmv on standard sparse matrices (e.g. SuiteSparse Matrix Collection samples,
  committed); CG/GMRES convergence + time on an SPD and a nonsymmetric system.
- KPIs: spmv GFLOP/s vs scipy; iterations-to-tol and wall time vs scipy.
- Deliverables: `std/sparse/*.lm`, benchmarks.

**D4. FFT and signal processing.**
- Scope: 1D/2D FFT (radix-2/mixed-radix), real FFT, inverse; convolution (direct + FFT-based);
  correlation; FIR/IIR filters; windows; resampling.
- Replaces: FFTW, scipy.signal, numpy.fft.
- Baseline: FFTW (honest expert baseline) and numpy.fft.
- Accuracy: FFT round-trip error <= a few ULP-scaled bound vs high-precision DFT reference.
- Benchmark tasks: FFT at sizes {256, 4096, 65536, 2^20}; a convolution; an FIR filter over a long signal.
- KPIs: transforms/sec vs FFTW at each size; round-trip max error.
- Deliverables: `std/fft/*.lm`, `std/signal/*.lm`, benchmarks.

**D5. Numerical calculus.**
- Scope: quadrature (Gauss-Legendre, adaptive Simpson, tanh-sinh); numerical differentiation; ODE solvers
  (RK4, Dormand-Prince RK45, an implicit/stiff solver); PDE stencils (heat/Laplace on a grid).
- Replaces: QUADPACK, scipy.integrate, MATLAB ode45.
- Baseline: scipy.integrate.
- Accuracy: integral/solution error <= tol vs analytic or high-precision reference.
- Benchmark tasks: integrate a set of functions to tol; solve a stiff and a non-stiff ODE system; a 2D
  heat-equation time-stepper.
- KPIs: function-evals and wall time to reach tol vs scipy; ODE steps/sec.
- Deliverables: `std/calculus/*.lm`, benchmarks.

### Tier 2 - Scientific and statistical (incumbents: Python/NumPy/SciPy, R, Julia, MATLAB)

**D6. Probability and statistics.**
- Scope: pdf/cdf/quantile/sampling for the standard distributions (normal, lognormal, t, chi2, F, gamma,
  beta, poisson, binomial); mean/var/moments; OLS/GLM regression; t-test, chi2-test, KS-test; correlation.
- Replaces: scipy.stats, R stats, statsmodels.
- Baseline: scipy.stats / R.
- Accuracy: cdf/quantile <= 1 ULP-scaled bound vs mpmath; regression coefficients within backward-error.
- Benchmark tasks: cdf/quantile accuracy sweeps; a regression fit; a batch of hypothesis tests.
- KPIs: max-ULP per distribution function; fit time vs statsmodels.
- Deliverables: `std/stats/*.lm`, benchmarks.

**D7. Random number generation.**
- Scope: uniform, normal, and the above distributions; splittable/counter-based PRNG (PCG64,
  Philox/Threefry) for reproducible parallel streams; vectorized generation.
- Replaces: numpy.random, PCG, Mersenne Twister.
- Baseline: numpy.random (Generator/PCG64).
- Accuracy: statistical quality gated by a test battery (mean/var/moment tests, chi2 uniformity,
  autocorrelation, ideally a TestU01 SmallCrush-style subset); reproducibility bit-exact for a fixed seed.
- Benchmark tasks: generate 100M uniforms/normals; run the quality battery; verify seed reproducibility.
- KPIs: samples/sec vs numpy; quality battery pass; bit-reproducibility across runs.
- Gate specifics: G2 (seed-driven, not a canned stream); reproducibility is part of the accuracy contract.
- Deliverables: `std/random/*.lm`, benchmarks.

**D8. Optimization.**
- Scope: 1D root-finding (Newton, Brent); unconstrained (gradient descent, L-BFGS, Nelder-Mead); linear
  programming (simplex or interior point); quadratic programming (OSQP-style ADMM); simple constrained NLP.
- Replaces: scipy.optimize, NLopt, OSQP.
- Baseline: scipy.optimize / OSQP.
- Accuracy: converged solution within tol of the reference optimum; KKT residual <= tol.
- Benchmark tasks: a standard test set (Rosenbrock, etc.) for unconstrained; an LP; a QP (e.g. a portfolio
  optimization, tying to FE-API).
- KPIs: iterations and wall time to tol vs scipy/OSQP; final objective gap.
- Deliverables: `std/optimize/*.lm`, benchmarks.

**D9. Automatic differentiation.**
- Scope: forward-mode (dual numbers) and reverse-mode (tape) AD over the numeric core; gradients,
  Jacobians, Hessians of Lumen functions.
- Replaces: JAX, autograd, PyTorch autograd, Enzyme.
- Baseline: JAX/autograd for correctness; hand-derived analytic gradients for accuracy.
- Accuracy: AD gradient == analytic gradient to <= a few ULP on a test set of functions.
- Benchmark tasks: gradient of Black-Scholes (the Greeks — ties to FE-API), gradient of a small MLP,
  Jacobian of an ODE right-hand-side. Compare AD result to analytic and to finite-difference.
- KPIs: gradient accuracy (ULP vs analytic); AD overhead ratio (time(grad)/time(fn)) vs JAX.
- Deliverables: `std/autodiff/*.lm`, benchmarks. This is a flagship: AD that is fast AND certified against
  analytic truth is a strong "only Lumen" story (full-stack ownership lets AD be a compiler pass).

**D10. Tensors and ML primitives.**
- Scope: n-d arrays with broadcasting; elementwise ufuncs; reductions; matmul-backed dense/conv layers;
  activations (relu, sigmoid, softmax, gelu); a forward+backward pass of a small MLP and a small conv net.
- Replaces: NumPy, PyTorch (inference/small-scale), tinygrad.
- Baseline: NumPy for correctness and small-scale speed; note where BLAS/PyTorch keeps the edge at scale.
- Accuracy: elementwise <= 1 ULP-scaled; a full inference pass matches NumPy within a stated tolerance.
- Benchmark tasks: an MLP forward+backward on a batch; a small conv layer; a softmax over a large tensor.
- KPIs: elements/sec per op vs NumPy; inference latency vs NumPy/PyTorch; the honest scale boundary.
- Deliverables: `std/tensor/*.lm`, benchmarks.

### Tier 3 - Symbolic, exact, and verified (incumbents: Mathematica, SymPy, GMP/MPFR, Lean, APL)

**D11. Arbitrary precision and big integers.**
- Scope: arbitrary-precision integers (add/mul via Karatsoft/Toom, div, gcd, modpow); rationals;
  arbitrary-precision floats (MPFR-style) with correct rounding.
- Replaces: GMP, MPFR, Python int, Java BigInteger.
- Baseline: GMP/MPFR and Python int.
- Accuracy: exact for integers/rationals; correctly-rounded for arbitrary-precision floats.
- Benchmark tasks: multiply two 10k-digit integers; modpow (RSA-size); compute pi to 10k digits.
- KPIs: exactness (mandatory); ops/sec vs GMP/Python.
- Deliverables: `std/bignum/*.lm`, benchmarks.

**D12. Symbolic algebra / CAS.**
- Scope: expression trees; algebraic simplification; symbolic differentiation and (rule-based)
  integration; polynomial arithmetic, GCD, factoring; equation solving; substitution; series expansion.
- Replaces: SymPy, Mathematica, Maxima, SageMath.
- Baseline: SymPy for correctness.
- Accuracy: exact symbolic equality (canonical-form comparison) against SymPy on a test set.
- Benchmark tasks: differentiate/simplify a battery of expressions; expand a polynomial product; solve a
  system; a series expansion. Compare canonical forms to SymPy.
- KPIs: correctness rate vs SymPy; time per operation vs SymPy.
- Deliverables: `std/symbolic/*.lm`, benchmarks. Strong prompt-to-green domain: symbolic code is where LLMs
  make the most silent errors, so a language whose CAS is correct-by-construction wins rounds-to-green.

**D13. Interval and verified arithmetic.**
- Scope: interval arithmetic (add/mul/div/functions with outward rounding); verified function ranges;
  verified root enclosures.
- Replaces: MPFI, INTLAB, Boost.Interval.
- Baseline: MPFI / INTLAB.
- Accuracy: guaranteed enclosure (the true value is provably inside the returned interval) - this is the
  correctness contract, verified against MPFR.
- Benchmark tasks: evaluate functions over intervals and verify enclosure; a verified root-finding.
- KPIs: enclosure tightness vs MPFI; verified-correct rate (must be 100%); ops/sec.
- Deliverables: `std/interval/*.lm`, benchmarks. Ties to CFM: interval arithmetic can CERTIFY the ULP
  bounds the fast-math kernels claim, making the accuracy story self-verifying.

**D14. Array / APL-style programming.**
- Scope: rank-polymorphic array operations; map/reduce/scan/outer-product; reshape, transpose, gather,
  scatter; the APL/J/K core verbs over n-d arrays.
- Replaces: APL, J, K/Q, NumPy, Julia broadcasting.
- Baseline: NumPy / Julia.
- Accuracy: exact/elementwise-gated.
- Benchmark tasks: a set of array-programming idioms (running sums, moving averages, group reductions,
  matrix construction) timed vs NumPy.
- KPIs: elements/sec per idiom vs NumPy.
- Deliverables: `std/array/*.lm`, benchmarks.

### Tier 4 - Applied and domain-specific (incumbents: QuantLib, OpenSSL, CGAL, NetworkX, SQL/pandas, CUDA)

**D15. Quantitative finance (flagship - ties to FE-API and the Academy).**
- Scope: pricing (Black-Scholes closed-form + Greeks; binomial/trinomial trees; Monte Carlo; PDE/finite
  difference); yield curves (bootstrapping, interpolation); risk (VaR, expected shortfall, CVA); vol
  surfaces. General over instrument parameters (per G2 - never bake S/K/r/T).
- Replaces: QuantLib, FE-API's own pricing, Excel/VBA quant sheets.
- Baseline: QuantLib and the honest scalar-libm C pricer (same algorithm, same accuracy).
- Accuracy: prices within the price's condition-number-limited ULP of a high-precision reference; verify
  the Lumen price ULP EQUALS the reference implementation's ULP on the same grid (the honest parity claim).
- Benchmark tasks: batch-price a portfolio of MANY DISTINCT options (varying S, K, r, T, vol - not one
  baked option) via each method; compute the full Greek vector via D9 AD; a Monte Carlo price with
  reproducible RNG (D7); a PDE price.
- KPIs: distinct-options priced/sec vs QuantLib and vs scalar-libm-C; price ULP vs reference; Greeks
  accuracy vs analytic.
- Gate specifics: G1 (vectorization from the Lumen compiler, not a spliced kernel), G2 (all option params
  read from the data - randomize S/K/r/T and require correct prices for all), G3 (QuantLib + honest C).
- Deliverables: `std/finance/*.lm`, benchmarks. This is where "Lumen beats C, honestly and generally" gets
  proven or not - and it must be general over instruments, or it does not count.

**D16. Cryptographic math.**
- Scope: modular arithmetic; finite fields (GF(p), GF(2^n)); elliptic-curve point ops; hash/prime
  primitives. CONSTANT-TIME where security-relevant.
- Replaces: OpenSSL bignum, libsodium.
- Baseline: OpenSSL/libsodium.
- Accuracy: exact; plus a constant-time verification (no data-dependent branches/timing on secrets).
- Benchmark tasks: modpow; EC scalar multiplication; verify constant-time via a timing/branch audit.
- KPIs: ops/sec vs OpenSSL; exactness; constant-time pass.
- Deliverables: `std/crypto/*.lm`, benchmarks. Note: correctness and constant-time dominate speed here;
  a fast non-constant-time result is a failure, not a win.

**D17. Computational geometry.**
- Scope: exact/robust predicates (orientation, in-circle); convex hull; Delaunay triangulation; point-in-
  polygon; segment intersection; nearest-neighbor.
- Replaces: CGAL, shapely, Boost.Geometry.
- Baseline: CGAL (robust) / shapely.
- Accuracy: robust predicates must be EXACT (use D11/D13 for exact/adaptive arithmetic) - robustness is
  the contract, floating-point-only is a failure.
- Benchmark tasks: convex hull of a large point set; a triangulation; a batch of robust predicates on
  degenerate inputs.
- KPIs: robustness (100% correct on degenerate cases); points/sec vs CGAL.
- Deliverables: `std/geometry/*.lm`, benchmarks.

**D18. Graph and combinatorics.**
- Scope: representations (adjacency list/CSR); BFS/DFS; Dijkstra/Bellman-Ford; connected components;
  MST; PageRank/spectral; basic combinatorics (permutations, partitions).
- Replaces: NetworkX, Boost.Graph, igraph.
- Baseline: NetworkX (correctness) / Boost.Graph (speed).
- Accuracy: exact.
- Benchmark tasks: shortest paths and PageRank on standard graphs (committed samples).
- KPIs: edges/sec vs NetworkX/Boost; exactness.
- Deliverables: `std/graph/*.lm`, benchmarks.

**D19. Relational, set, and dataframe operations.**
- Scope: columnar tables; filter, project, group-by, aggregate, join, sort, window functions over
  columnar data.
- Replaces: SQL engines, pandas, Polars.
- Baseline: Polars / DuckDB (honest fast baselines) and pandas.
- Accuracy: exact result-set equality vs the baseline.
- Benchmark tasks: a group-by-aggregate and a join over millions of rows; a windowed rolling aggregate.
- KPIs: rows/sec per operation vs Polars/pandas; exact result parity.
- Deliverables: `std/table/*.lm`, benchmarks.

**D20. Parallel and GPU execution model (stretch / forward-looking).**
- Scope: a parallel `map`/`reduce` over the array model exploiting multicore; a lowering path toward
  SIMD-then-threads-then-GPU. Define the model even if only CPU-parallel lands first.
- Replaces: OpenMP, TBB, CUDA, JAX pmap.
- Baseline: OpenMP-parallel C for CPU; note GPU as future.
- Accuracy: deterministic reduction ordering option (bit-reproducible) plus a fast non-deterministic mode,
  both gated.
- Benchmark tasks: a parallel batch pricer (D15) scaling across cores; a parallel reduction.
- KPIs: scaling efficiency vs cores; throughput vs OpenMP-C.
- Deliverables: `std/parallel/*.lm`, benchmarks. Sequenced last; depends on the SIMD lowering being real
  (G1) first.

---

## 4. Pillar A in depth - the prompt-to-green benchmark (the headline)

This is the metric that makes Lumen matter, and the hardest to fake. Build it rigorously.

- **Corpus:** >= 100 frozen tasks spanning the domains above (start with 3-5 per domain), each with a
  hidden test suite that defines "green," a natural-language spec, and a difficulty label. Freeze and
  version the corpus; never let the model see the hidden tests.
- **Protocol:** for a fixed model and identical prompting, attempt each task in Lumen and in each control
  language (Python, Rust, Julia, C). On each failed attempt, feed back ONLY the compiler/test diagnostic
  (the real dev loop), and retry, up to a cap. Record rounds-to-green, tokens-to-green (prompt + output
  tokens read and written), and one-shot-green rate. Deterministic seeds; log every round and every
  diagnostic.
- **The lever this measures and must improve:** Lumen wins rounds-to-green by (a) clarity-by-construction
  (fewer ways to write it wrong), (b) structured diagnostics - every error has a stable code, a
  byte-precise span, exactly one concrete fix, and a machine-applicable patch, and is short enough not to
  blow the model's context (tokens-to-green counts tokens READ), and (c) a fast compiler (Pillar B) so
  more rounds fit per unit time. Upgrading diagnostics is the single highest-leverage language-side work;
  each error class upgraded should show a measurable rise in one-round-fix rate on the corpus.
- **KPIs:** median and p90 rounds-to-green; median tokens-to-green; one-shot-green rate; all as a RATIO
  to Python and Rust on the same model. Target: Lumen rounds-to-green <= 0.5x Python's; one-shot-green
  rate >= 2x Python's. Report per-domain, not just aggregate.
- **Honesty:** the corpus and hidden tests are frozen and unseen; the control-language attempts use the
  same model and prompting (no sandbagging the controls); publish the full logs. An unfalsifiable
  "unmatched prompt-to-green" claim fails G4-in-spirit - the number must come from this rig.

---

## 5. Pillar B in depth - the fastest compiler

- **KPIs:** cold-compile latency (ms) and incremental-compile latency (ms) at program sizes {100, 1k, 10k,
  100k LOC}; edit-to-first-error latency (ms); compile throughput (kLOC/sec). Compare to rustc, clang,
  gcc, the Julia JIT, and a Python import baseline.
- **Targets:** sub-millisecond incremental compile for the edit-error-fix loop; fastest cold compile of
  any statically-compiled language at each size. The compiler is on the prompt-to-green critical path:
  every millisecond of compile is a millisecond the model waits, so this directly improves Pillar A.
- **Requirements:** incremental/streaming front-end; the token-region and memory-map work must scale to
  large programs (the self-host-scale capacity walls); diagnostics emitted in the same pass as parsing so
  edit-to-error is one fast pass.
- **Honesty:** measure real programs from the corpus, not a trivial hello-world; report the full size sweep.

---

## 6. Pillar C in depth - fastest execution, earned

- Execution speed is proven per-domain in Section 3, each gated by G1-G8. The cross-cutting requirement:
  every "beats X" number must be produced by the Lumen compiler's own emission (G1), general over inputs
  (G2), against an honest baseline (G3), at a declared accuracy (G4).
- The general capabilities that let Lumen win legitimately (build these as real compiler passes, not
  per-benchmark hacks): a SIMD lowering pass in `emit_fn.lm`/`optimize.lm` that vectorizes any `map` over
  numeric arrays; Certified Fast Math (bounded-error transforms - FMA, reassociation, minimax, tunable
  accuracy - each carrying a certificate the ULP gate checks); partial evaluation of loop-invariant and
  constant subexpressions; the numeric-aware accelerator choosing kernel/degree from the required accuracy.
- The boundary, stated honestly: against decade-tuned incumbents (OpenBLAS gemm, FFTW), Lumen's realistic
  win is on fused, specialized, and small/batched cases plus automatic vectorization the incumbent's
  idiomatic use does not give the quant; on large dense BLAS/FFT, target parity and say so. Do not
  generalize a narrow win.

---

## 7. The KPI dashboard - the definition of success

`bench/DASHBOARD.md`, auto-generated, one row per domain plus the three pillars, columns:

| Domain/Pillar | Metric | Lumen | Honest baseline | Ratio | Accuracy (max ULP / exact) | G1 | G2 | G3 | G4 | G5 | G6 | G7 | G8 |

Aggregate scorecards at the top:
- **Coverage:** domains with all standard ops implemented and gated / total domains.
- **Execution:** domains where Lumen >= honest baseline at the accuracy bound / total; and the median ratio.
- **Prompt-to-green:** median rounds-to-green ratio vs Python; one-shot-green ratio.
- **Compiler:** incremental-compile latency; cold-compile ratio vs rustc/clang.
- **Honesty:** deliverables passing all gates / total (must be 100% to count as done).

A domain is DONE when: all standard ops implemented in Lumen source, differentially tested (G8), gated at
its accuracy bound (G4), benchmarked against the honest baseline (G3, G5), the winning path is Lumen-emitted
(G1) and input-general (G2), with assembly evidence for SIMD claims (G7), spanning the operation set (G6),
and the DASHBOARD row is committed. Anything less is "in progress," never "done."

---

## 8. How to burn tokens productively (parallel work packages)

Dependency order:
1. **WP0 (blocking):** Section 2 infrastructure + Section 1 honesty gate harness. Nothing else counts
   until this exists.
2. **WP-lang (parallel, ongoing):** the general compiler passes of Section 6 (SIMD lowering, Certified
   Fast Math, partial evaluation) - these are shared leverage; a win here lifts every domain honestly.
   And the structured-diagnostics upgrade of Section 4 - shared leverage for Pillar A.
3. **WP-D1..D20 (parallel):** one domain per work stream, each self-contained (stdlib module + tests +
   differential tests + benchmark + DASHBOARD row). Tier 1 first (they anchor the numeric core others
   build on: D1 feeds D5/D6/D9/D15; D2 feeds D8/D10/D15; D7 feeds D15).
4. **WP-promptgreen (parallel, ongoing):** grow the corpus toward 100+ tasks as domains land; run the
   rounds-to-green rig; each diagnostic upgrade must show a measured delta.
5. **WP-D20 (last):** parallel/GPU, after SIMD lowering is a real Lumen pass.

For each domain, the token-burn loop is: read the domain spec here -> implement the Lumen stdlib module ->
write the differential test (G8) against the reference vectors -> write the benchmark (G3, G5) -> run the
honesty gate (G1-G7) -> if it fails a gate, fix the IMPLEMENTATION (never the gate) -> commit -> update
DASHBOARD. Repeat across all operations in the domain until G6 (full coverage) is met.

Rule for every stream: when a "beats X" number appears, the honesty gate runs automatically before the
number is believed. A number that fails a gate is deleted, not shipped. Two false "beat C" claims already
happened; the gate is what makes the third one real.

---

## 9. The one-sentence definition of the whole plan

Lumen covers every math domain of every major language when, for each domain, a correct-by-construction
Lumen stdlib module - written in Lumen, vectorized by the Lumen compiler, general over its inputs,
certified to a declared accuracy against a high-precision reference, and benchmarked against the honest
incumbent - appears on the dashboard at or above the incumbent's speed; while across all of them Lumen
reaches green in fewer model rounds and fewer tokens than any other language, compiled faster than any
other compiler, with every number produced by a committed, gated, reproducible harness.
