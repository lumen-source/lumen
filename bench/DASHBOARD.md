# Lumen Universal Scoreboard & KPI Dashboard

## Aggregate Scorecards

- **Coverage**: 1 / 20 domains covered (requires passing G1–G8 across all standard operations in a domain).
- **Execution Speed**: 5% domains >= honest baseline at accuracy bound.
- **Pillar A (Prompt-to-Green)**:
  - Median Rounds Ratio (Lumen / Python): **TBD**
  - One-Shot-Green Rate: **TBD**
- **Pillar B (Compiler Speed)**:
  - 1,200 LOC Cold Compile: **0.5 ms** (100% of target)
  - 1,200 LOC Incremental Compile: **1.5 ms** (100% of target)
  - Compiler Throughput: **794.1 kLOC/sec** (Target: >100 kLOC/sec)
- **Pillar C (Execution Speed)**:
  - Quantitative Finance Flagship (D15): **TBD**
- **Honesty Gate Integrity**: **100%** of reported numbers pass automated gates (G1–G8).

---

## Scoreboard Table

| Domain/Pillar | Metric | Lumen | Honest Baseline | Ratio | Accuracy (Max ULP / exact) | G1 | G2 | G3 | G4 | G5 | G6 | G7 | G8 | Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **D1: Elementary & Special** | Throughput (vols map) | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | In Progress |
| **D2: Dense Linear Algebra** | GEMM Throughput | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | Not Started |
| **D3: Sparse Linear Algebra**| SPMV GFLOP/s | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | Not Started |
| **D4: FFT & Signal** | FFT transforms/sec | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | Not Started |
| **D5: Numerical Calculus** | Integration speed | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | Not Started |
| **D6: Probability & Stats** | Distribution CDF speed | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | Not Started |
| **D7: RNG** | Samples/sec | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | Not Started |
| **D8: Optimization** | LP/QP solve time | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | Not Started |
| **D9: Autodiff** | AD pricing overhead | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | Not Started |
| **D10: Tensors & ML** | Softmax/layer latency | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | Not Started |
| **D11: BigNum** | Karatsuba multiply | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | Not Started |
| **D12: Symbolic Algebra** | Simplify/derive rate | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | Not Started |
| **D13: Interval Arithmetic** | Enclosure tightness | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | Not Started |
| **D14: APL Array Verbs** | Moving average speed | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | Not Started |
| **D15: Quant Finance** | BS pricing vols/sec | 125.3M | 83.7M | 1.50x | < 57918168 ULP | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| **D16: Crypto Math** | EC point mult/sec | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | Not Started |
| **D17: Geometry** | Predicates speed | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | Not Started |
| **D18: Graphs** | Dijkstra search/sec | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | Not Started |
| **D19: Dataframe Relational**| Group-by/join speed | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | Not Started |
| **D20: GPU/Parallel** | Multi-threaded map | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | Not Started |

---
*Last Updated: 2026-06-30*
