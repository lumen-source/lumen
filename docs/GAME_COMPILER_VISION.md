# Lumen as a Semantic Game & Simulation Compiler

> **Status:** Strategic Architecture Specification & Vision  
> **Canonical Path:** `docs/GAME_COMPILER_VISION.md`  
> **Related Documents:** [VISION_2035.md](file:///Users/freedom/lumen-source/lumen/VISION_2035.md), [MANIFESTO.md](file:///Users/freedom/lumen-source/lumen/docs/MANIFESTO.md), [ROADMAP_2036.md](file:///Users/freedom/lumen-source/lumen/docs/ROADMAP_2036.md), [0001-capabilities-v1.md](file:///Users/freedom/lumen-source/lumen/docs/rfcs/0001-capabilities-v1.md)

---

## 1. Executive Summary: Semantic Compiler vs. Rendering Engine

Today, AI-generated games rely on large language models (LLMs) generating thousands of lines of fragile, imperative code targeting engine APIs (Unity, Unreal, Godot, Three.js). The model must manually coordinate scene structures, physics steps, animation loops, state machines, asset lifecycles, and platform plumbing. The result is integration fragility, high prompt-to-green token cost, unprovable state behavior, and platform lock-in.

Lumen's architecture transforms game generation by acting as a **semantic game compiler**:

```text
Prompt
  ↓
game.lm (Semantic Game Specification)
  ↓
Lumen Compiler Validation & Invariant Checking
  ↓
Lumen Game IR
  ├── Simulation IR (Deterministic Rules, Physics, Time, Rules)
  ├── Visual IR (Scene Intent, Lighting, Shaders, Camera)
  ├── Audio IR (Spatial Sound, Dynamic Scoring)
  ├── Interaction IR (Input Maps, Event Loops)
  └── Asset Graph (Procedural & Immutable Ref Budgets)
  ↓
Verified Multi-Platform Runtimes
  ├── WebGPU / Three.js (Browser)
  ├── Native Metal / Vulkan (Desktop & Mobile)
  ├── Godot / Unity C# Bridge (Engine Embedding)
  └── Headless Deterministic Simulation (Monte Carlo Verifier)
```

The model generates **semantic intent and invariant constraints**, not low-level engine plumbing.

---

## 2. Alignment with Core Lumen Principles

| Game Compiler Principle | Core Lumen System | Architectural Alignment |
| :--- | :--- | :--- |
| **Reduced LLM Search Space** | Capability-purity & Soundness (`capabilities-v1`) | Invalid state combinations and illegal engine calls are syntactically and semantically unrepresentable. |
| **10,000 Headless Simulations** | Replayable Deterministic Engine (`lumen run --record`) | Games compile to a headless simulation target where 10,000 playthroughs run in milliseconds to prove balance and completion. |
| **Invariant Guarantees** | Contracts & Provable Correctness (`Result`, `match`, type checking) | Game rules (`Player.health >= 0`) are verified compile-time invariants or runtime-gated assertion traps. |
| **Regenerable & Portable** | Intermediate Representation (`lumenc.lm` IR) | Prompt changes update high-level `game.lm` specs; compiler re-lowers to any target backend cleanly. |
| **AI Optimization Loop** | Compiler as a Reward Environment (`bench/promptgreen`) | The model iteratively refines parameters against compiler performance and correctness verdicts. |

---

## 3. The 4-Layer Intermediate Representation (IR) Architecture

For semantic game compilation, Lumen defines four specialized intermediate representations built atop the core Lumen byte-identical IR:

```
+-----------------------------------------------------------------------+
|                               Game IR                                 |
|  - Entity Archetypes & Components (Deterministic Memory Footprint)    |
|  - Game State Transitions & Rule Invariants                           |
|  - Event Dispatch & Progression Logic                                 |
+-----------------------------------------------------------------------+
                                   │
                                   ▼
+-----------------------------------------------------------------------+
|                            Simulation IR                              |
|  - Deterministic Fixed-Point / Float Timestep Loop                    |
|  - Spatial Partitioning & Collision Queries                           |
|  - Behavior Trees & Agent Decision Kernels                            |
+-----------------------------------------------------------------------+
                                   │
                                   ▼
+-----------------------------------------------------------------------+
|                           Presentation IR                             |
|  - Render Pass Graph & Material Declarations                          |
|  - Spatialized Audio Emitters & Ambience                              |
|  - Camera Rig & Viewport Motion Intent                                |
+-----------------------------------------------------------------------+
                                   │
                                   ▼
+-----------------------------------------------------------------------+
|                            Execution IR                               |
|  - Target Emitters: Native C/Metal, Vulkan, WebGPU, Headless Sim      |
|  - Zero-Allocation Arena Allocators & Buffer Scheduling              |
+-----------------------------------------------------------------------+
```

---

## 4. Lowering Search Space: Declarative Archetypes

Instead of imperatively managing meshes, physics rigidbodies, timers, and scene removal in JS/C#:

```lumen
// High-level semantic specification in game.lm
archetype Projectile {
    visible Bullet
    motion ballistic(speed: 150.0d)
    collision damages Enemy by 20d
    lifetime 5 seconds
}
```

The Lumen compiler handles:
1. Deterministic Arena Allocation & Deallocation.
2. Renderer-Physics Double Buffering & Synchronization.
3. Spatial Grid Registration & Collision Dispatch.
4. Non-allocating Pool Recycles.

---

## 5. Declarative Invariants & Headless Monte Carlo Verification

Games compiled with `game.lm` carry machine-checkable invariants:

```lumen
invariant Player.health >= 0d
invariant Race.finishers <= Race.participants
invariant Mission eventually completes or fails
invariant Inventory.weight <= Player.capacity
invariant EnemySpawn.distance_from_player >= 20.0d
```

### Headless Verification Workflow
```text
game.lm
  ↓
lumenc --target=headless
  ↓
10,000 Simulated Runs (Sub-Second Wall-Clock)
  ├── Check 1: Level Completable? (Pathfinding & Traps)
  ├── Check 2: Progression Economy Balanced?
  ├── Check 3: Weapon Balance & Desync Multi-Player Audit
  └── Check 4: Determinism Bit-Identity Across Processes
```

---

## 6. The First Domain Wedge: Deterministic Web Arcade Games

To prove this paradigm without chasing bloated AAA complexity, the entry point focus is:

> **AI-generated arcade games that are deterministic, instantly playable in the browser, and automatically tested headlessly.**

### Deliverable Certificate Stack for Each Generated Game:
1. `game.lm` (High-level semantic source)
2. `game_certificate.json` (Invariants verified & 10,000 headless playthrough report)
3. `browser_build.html` (WebGPU / Three.js zero-dependency single-file bundle)
4. `native_build` (Natively compiled Metal / Vulkan binary)
5. `performance_report.json` (Frame-rate, memory footprint, load latency)
6. `replay.tape` (Deterministic replay file proving 100% bit-identity)

---

## 7. Roadmap Integration

This vision is integrated into [ROADMAP_2036.md](file:///Users/freedom/lumen-source/lumen/docs/ROADMAP_2036.md) under **Arc 4: Domain Expansion & Semantic Compiler Targets (Wave 7)**.
