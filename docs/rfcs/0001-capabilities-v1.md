# RFC 0001: Capabilities v1

- Status: draft
- Author(s): design lane (90-day work package 6, `docs/ROADMAP_2036.md` section 5 item 6)
- Created: 2026-07-13
- Tracking issue: none yet (this RFC is the tracking artifact until one is opened)

This RFC is a design document only. It proposes no implementation and changes no code
outside `docs/rfcs/`.

## Summary

Lumen's product thesis is that capability-as-the-only-effect lets an agent prove what a
function can touch (`docs/MANIFESTO.md` commitment 2; `VISION_2035.md` "capabilities-as-the-
only-effect... uniquely suited to" verified finance and multi-tenant SaaS). Today the
language has exactly one capability, `Console`, threaded as an ordinary parameter, and zero
effect-row machinery (`docs/ROADMAP_2036.md` gap register item 1, quoted below). This RFC
proposes the v1 design: extend the existing capability-as-ordinary-parameter mechanism to a
primordial set (Console, Clock, Random, FileSystem, Env, Network) and a v2 service set
(Http, Sql, Queue, Auth, Tenant, Secret), specify how a function's effect row is derived from
its capability parameters, specify the deterministic-fake versus tainted-real split, and lay
out a lowering plan onto the current IR staged over 3 to 5 PRs. It does not resolve the
lambda-cap metatheory (`docs/spec/LAMBDA_CAP.md`); it states plainly which obligations it
discharges and which it does not.

## Motivation

`docs/ROADMAP_2036.md`, gap register item 1:

> "The effect system is not in the language. Capability-as-the-only-effect is the product
> thesis - 'prove what it can touch' - and today the only capability is `Console`. No derived
> effect rows, no capability set (Clock, Random, FileSystem, Network, and the SaaS set), no
> deterministic fakes versus tainted reals, no handlers, no contracts. Until this lands, the
> trust layer is a design document. The single biggest gap."

`VISION_2035.md` states the concrete target this closes:

> "The single mechanism Lumen already ships, the capability as an ordinary typed parameter,
> expresses Http, Sql, Queue, Auth, Tenant, and Secret. A function with no capability
> parameters is provably pure; a handler that omits the Tenant parameter provably cannot touch
> tenant data, so multi-tenant isolation is a type error rather than a runtime audit."

This RFC exists because Arc 2 of `docs/ROADMAP_2036.md` ("the trust machine")
cannot start without a written design for what capabilities v1 actually contains, and because
`docs/ROADMAP_2036.md` lists "Capabilities v1 RFC" as the sixth of the next 90 days'
work packages, explicitly "written against the mechanization plan so the proof and the
implementation land aligned."

Which commitments this serves, per `docs/MANIFESTO.md`: commitment 2 (debuggability - "what a
function can touch is written in its type") directly; commitment 3 (provable correctness)
partially, and only to the extent Section 6 below says it does; commitment 1 (clarity by
construction, one canonical way) is the reason Section 2 opens with the zero-new-syntax null
hypothesis rather than proposing a `with`/handler block up front.

## Design

### The null hypothesis: zero new syntax

`docs/DECISIONS.md` D8 already names the capability as "the single mechanism for effects,
authority, purity, and determinism classification." `LANGUAGE.md` already documents
`Console` as an ordinary parameter type with no special declaration syntax: "Only `main`
receives it; pass it down to helpers that need to print." The null hypothesis for v1 is
therefore: **no new syntax at all**. Every proposed capability is an ordinary type; every
capability operation is an ordinary function or a dot-call on that type, exactly like
`console.print` today. `docs/GRAMMAR.md` section 3.1 already states the reasoning this RFC
inherits without change: "Capability parameters are ordinary parameters whose type is a
capability type... there is no special syntax for them, which keeps the surface minimal."

Any future proposal that adds syntax (a `with` block, a `handle` keyword, an effect-row
annotation on a function signature) must argue against `docs/MANIFESTO.md`'s one-mechanism
rule explicitly: what does the new syntax let an author express that ordinary parameter
passing, plus the derivation rule in Section 3, cannot? This RFC finds no such case for v1 and
proposes none. The one place this RFC flags a possible future need for new syntax is the
handler-installation question in Section 6 (capabilities today have no scope-bounded grant
mechanism at all, because there is no `handle[c]` construct implemented); that is deliberately
deferred, not decided here.

### The primordial set

Per `docs/ROADMAP_2036.md`: "Console, Clock, Random, FileSystem, Network, Env." Each
capability is a nominal type (a record or an opaque tag, following the `Console` precedent in
`LANGUAGE.md`, which itself is opaque with no fields documented). Operation signatures
below use only types that exist today per `LANGUAGE.md`: `Int`, `Float`, `Text`, `Unit`,
`Result[T, E]`, user-defined records and sum types. Where a signature cannot be expressed in
current-Lumen types, that is stated, not papered over.

```
Console (exists today, LANGUAGE.md)
 print(c: Console, t: Text) -> Unit
 print_int(c: Console, n: Int) -> Unit

Clock (new)
 now(c: Clock) -> Int # unix millis; deterministic fake returns a scripted sequence

Random (new)
 draw(c: Random) -> Int # next value from a seeded stream (DETERMINISM_CONTRACT.md:
 # "draws are recomputed from the seed, not stored")

FileSystem (new)
 read_file(c: FileSystem, path: Text) -> Result[Text, FsError]
 # list_dir is NOT proposed for v1: it needs to return a variable number of Text entries,
 # and Lumen today has no List/array-of-Text type (only the Float array in LANGUAGE.md).
 # This is gap register item 6 (docs/ROADMAP_2036.md). Blocked, not designed around.

Env (new)
 get(c: Env, key: Text) -> Result[Text, EnvError]

Network (new)
 request(c: Network, url: Text, body: Text) -> Result[Text, NetError]
 # a raw text-in/text-out primitive; framing, headers, and status codes are explicitly
 # out of scope for the primordial capability and belong to the Http service capability below.
```

Each error type (`FsError`, `EnvError`, `NetError`) is a user-defined record or sum type per
`LANGUAGE.md`'s existing type declaration forms; this RFC does not fix their fields, which is
ordinary library design, not effect-system design.

### The v2 service set

Per `docs/ROADMAP_2036.md`: "Http, Sql, Queue, Auth, Tenant, Secret." These are
proposed as capabilities *derived* from the primordial set (composition, not new host
machinery), consistent with `docs/MANIFESTO.md`'s self-containment mandate: no foreign HTTP or
SQL driver is a legal dependency, so a service capability's real backend must eventually be
Lumen-native code built over `Network`, not a wrapped external library.

```
Http (new, derived over Network)
 type HttpRequest = { method: Text, path: Text, body: Text }
 type HttpResponse = { status: Int, body: Text }
 # a request-dispatch surface ("register a handler for a route") needs first-class
 # functions/closures to pass a callback, which do not exist yet (gap register item 6,
 # docs/ROADMAP_2036.md: "no first-class functions or closures (handlers and most
 # of the stdlib need them)"). v1 can define the request/response records and a
 # respond(c: Http, resp: HttpResponse) -> Unit primitive; it cannot define a general
 # dispatch table until that gap closes. This is the single largest blocker in the v2 set.

Sql (new, derived over Network)
 query(c: Sql, statement: Text) -> Result[Text, SqlError]
 # result rows are returned as a single serialized Text blob (no row/table type exists yet);
 # a structured row type is future work once records-with-generics or a stdlib Row type lands.

Queue (new, derived over Network)
 enqueue(c: Queue, message: Text) -> Result[Unit, QueueError]
 poll(c: Queue) -> Result[Text, QueueError]

Auth (new)
 verify(c: Auth, token: Text) -> Result[Text, AuthError] # returns a principal id on success

Tenant (new)
 id(c: Tenant) -> Text # the flagship capability for Section 3's worked example

Secret (new)
 get(c: Secret, name: Text) -> Result[Text, SecretError]
```

## Derived effect rows

`docs/spec/LAMBDA_CAP.md` is the normative kernel this section maps onto. Two things must be
stated precisely, because reading the calculus closely surfaces a real gap between it and
today's `Console`.

### The multi-operation gap (not resolved by this RFC)

`docs/spec/LAMBDA_CAP.md`, rule `(T-Use)`, ties a capability kind `c` to exactly
one result type: "`k: Cap c @ l in D... use k e: Tres(c) ! (R u {c})`". `Tres` is a function
of the kind alone. But `Console` already has two operations (`print`, `print_int`, per
`LANGUAGE.md`, and confirmed in the interpreter as two distinct opcodes,
`seed/compiler_core.mjs`: opcode 16 is `PRINTTEXT`, opcode 10 is `PRINTINT`), and
every capability proposed above except `Clock`, `Random`, and `Tenant` has more than one
operation. The calculus as written does not literally model a multi-operation capability kind.
This RFC does not resolve this; it is carried into Open Questions below as the first item,
because silently assuming the calculus already covers today's `Console` would misstate what is
proven.

### The derivation rule this RFC proposes

Given that gap, the practical rule proposed for v1 (pending the calculus extension in Open
Question 1): a function's derived effect row is the union, over every capability-typed
parameter it holds, of the capability kinds it actually invokes an operation on along at least
one control path, computed structurally from the call graph rather than annotated. A function
with zero capability-typed parameters has row `{}` and is, per `docs/spec/LAMBDA_CAP.md`
Theorem 2, provably pure: it cannot invoke `use` against any kind, because it holds no
capability value to invoke it with. This half of the claim is already true and checkable
today, trivially, because the only capability that exists is `Console` and a function without
it in its parameter list cannot call `console.print`.

`lumen effects fn` is proposed as a new CLI subcommand (none exists today; `LANGUAGE.md` line
7-11 documents only `run`, `check`, `ir`) that reports the derived row for a named function as
a machine-readable list of capability kinds, following the format convention of the canonical
Diagnostic (`docs/DECISIONS.md` D8).

### The flagship claim, worked, and precisely scoped

The claim from `VISION_2035.md` ("a handler that omits the Tenant parameter provably
cannot touch tenant data") is worth stating exactly, because "handler" is used two different
ways across the required reading and this RFC must not silently conflate them: `LAMBDA_CAP.md`
uses "handler" for the `handle[c] e with h` construct that installs a capability (Section 3);
`VISION_2035.md` and `docs/ROADMAP_2036.md` use "handler" colloquially for an HTTP route
handler function. Lumen today, and this RFC, propose nothing about the first sense; `handle[c]`
is not implemented and this RFC does not add it (see Section 6). The claim below is about the
second sense only, and it is discharged by ordinary parametric typing, not by
`docs/spec/LAMBDA_CAP.md` Theorem 3 (capability non-escape), which is about the first sense.
That distinction matters and is flagged again in Section 6.

Worked example, using only the capability set proposed above and a smart-constructor
(attenuation) pattern:

```lumen
# TenantSql can only be constructed by a function that itself holds both Sql and Tenant.
type TenantSql = { sql: Sql, tenant_id: Text }

fn scoped_sql(sql: Sql, tenant: Tenant) -> TenantSql {
 return TenantSql { sql: sql, tenant_id: tenant.id() }
}

fn tenant_query(ts: TenantSql, statement: Text) -> Result[Text, SqlError] {
 return ts.sql.query(statement) # illustrative; the real design scopes `statement` by ts.tenant_id
}

# safe: an HTTP route handler that has Tenant cannot construct TenantSql without it,
# and cannot call tenant_query without a TenantSql.
fn get_balance(sql: Sql, tenant: Tenant, account: Text) -> Result[Text, SqlError] {
 let ts = scoped_sql(sql, tenant)
 return tenant_query(ts, account)
}

# a route handler written WITHOUT Tenant simply cannot obtain a TenantSql at all:
fn get_balance_unsafe(sql: Sql, account: Text) -> Result[Text, SqlError] {
 let ts = scoped_sql(sql, tenant) # compile error: `tenant` is not in scope, E-family TBD
 return tenant_query(ts, account)
}
```

The guarantee this actually proves: a function cannot construct a `TenantSql` value, and
therefore cannot call `tenant_query`, unless a `Tenant` capability is among its own parameters
(transitively). This is ordinary parametric scoping, already how `LANGUAGE.md` describes
`Console` threading today ("pass it down to helpers that need to print"). It is a real,
checkable, and useful guarantee. It is not the mechanized, region-based non-escape theorem
(`docs/spec/LAMBDA_CAP.md` Theorem 3), because that theorem is stated over `handle[c]` scopes
that do not exist in this design. Calling both of these "provable" without distinguishing them
would overstate what v1 delivers; Section 6 states the distinction as a discharge table.

## Determinism

`docs/spec/DETERMINISM_CONTRACT.md`'s table already assigns a control to each
nondeterminism source and ties every one of them to a capability: `Clock` to wall-clock time,
`Random` to randomness, `FileSystem` to filesystem ordering, `Env` to environment,
`Network`/IO to network. This RFC's primordial set is chosen to match that table exactly
(the same six names), so no new nondeterminism source is introduced outside the contract's
closed set.

**Fakes.** Per the contract, a deterministic fake exists for every capability, for the
test/replay path. This RFC proposes representing a fake as an ordinary Lumen value carrying
its own scripted responses, not as a closure or mock object, because Lumen has no first-class
functions today (gap register item 6). Concretely: `type FakeClock = { ticks: Int }` with a
`now` operation that increments and returns a field, rather than a function pointer. This is
weaker than a general mock (it cannot script conditional behavior) but is expressible in the
current type system, and is flagged as Open Question 3 below: whether a richer fake needs
closures to arrive first.

**Taint.** `docs/spec/DETERMINISM_CONTRACT.md` ("FFI / native boundary... Bridge
results carry a propagating nondeterminism taint") and `docs/spec/LAMBDA_CAP.md` (the
multi-shot marker: "taints the effect row with a `Multi` marker") together suggest the same
mechanism for real-versus-fake: a tainted capability kind is marked in the derived row itself
(for example `{Network:tainted}` versus `{Network:fake}`), by analogy with the existing
`Multi` marker, rather than as a separate type. This keeps the row the single place effect
information lives (consistent with Section 3's "derived, not annotated" rule) instead of
forking a second classification system. This is proposed, not decided; see Open Question 6.

**A contradiction flagged, not silently resolved.** `docs/DECISIONS.md` D9 states: "Lumen-mu
(the bootstrap subset) has no floating point at all, so the seed and self-hosting path are
unaffected by this decision." But `LANGUAGE.md` (which this RFC's own reading instructions
identify as documenting "the currently runnable subset of Lumen (called 'Lumen-mu'),")
documents `Float` as a full runnable type with literals, arithmetic, and a math library
(, 209-215), including a worked Black-Scholes kernel; and
`docs/ROADMAP_2036.md` states as already true: "Bit-exact numerics. Float literals,
arithmetic, and the math kernel reproduce the oracle to the bit in interpreter and native."
These two required sources disagree about whether Lumen-mu has floating point. This matters
here because `Clock.now` and any future numeric capability payload interact with D9's
determinism-level mechanism; the maintainer should resolve which statement is stale (most
likely D9 predates the float work landing) before this RFC's Clock/Random signatures are
locked, since D9's `reproducible`/`fast` split is the mechanism this RFC would otherwise
inherit unmodified for any Float-returning capability operation.

## Lowering onto the current IR

The `Console` precedent, read directly from the interpreter (`seed/compiler_core.mjs` line
16-17, `seed/lumenc.wat`, 810-811, 1373, 1496-1498): there is exactly **one host
import**, `console_print`, and **two IR opcodes**, `PRINTINT` (10) and `PRINTTEXT` (16), both
of which funnel into that one import. `PRINTINT` formats its integer to text inside the
interpreter (using a scratch buffer, `seed/lumenc.wat`) before crossing the host
boundary; `PRINTTEXT` calls the host directly with a Text pointer. The precedent is therefore:
**one host import per primordial capability kind**, with as many IR opcodes as that kind has
operations, and all data marshalling done IR-side before the host call.

Applying that precedent, the op budget for the primordial set is six new host imports
(`clock_now`, `random_draw`, `fs_read_file`, `env_get`, `net_request`, plus the existing
`console_print`), and one opcode per operation (roughly seven to nine new opcodes, depending on
how `Result` construction is lowered, which is already handled by the existing `MKSUM`/`SUMTAG`
opcodes per `seed/compiler_core.mjs`). No opcode can lower to an existing op because
each crosses a genuinely new nondeterminism boundary the existing 29 opcodes (0-28, plus the
raw-memory keystone at 53-56 and bitwise at 58-63, per `seed/compiler_core.mjs`)
have no seam for.

The v2 service set (Http, Sql, Queue, Auth, Tenant, Secret) is proposed to receive **zero new
host imports** in v1. Per `docs/ROADMAP_2036.md` ("a serving stack in embryo... a
34 KB Node-free native socket binary" already exists), any real backend for `Http`/`Queue`
should lower onto that existing native socket work rather than a new host seam; `Sql` has no
existing native driver and its real backend is left an explicit open question (Open Question 5)
rather than invented here. `Auth`, `Tenant`, and `Secret` are proposed as pure derivations (no
IO at all in v1: `verify` and `get` return their result from data already held, or are stubbed
to a fake until a real backend is designed), so they need no host import.

### Staged landing plan (3 to 5 PRs), seed-first / census-lockstep

Following the standing discipline in `docs/ROADMAP_2036.md` section 4 item 1 ("every front-end
feature lands seed-first, then the self-hosted compiler catches up to bit-identity. The census
only grows"):

1. **PR1: Clock and Random, fakes only.** New opcodes and host imports for the real path;
 `FakeClock`/`FakeRandom` record-based fakes (per Section 4). Gate: a census program for
 each, `lumen effects` reporting `{Clock}`/`{Random}` correctly, the self-hosted compiler
 (`lumenc.lm`) reproducing the same IR bit-identically (the existing float-fuzz and census
 pattern in `seed/selfhost_diff.mjs`).
2. **PR2: FileSystem and Env, real and fake.** New opcodes/imports for `read_file` and
 `get`; the `Result[T, FsError]`/`Result[T, EnvError]` error paths exercised against the
 `?` operator already in the language (`LANGUAGE.md`). Gate: same as PR1 plus a
 determinism-contract conformance test asserting the fake path never touches the host import.
3. **PR3: Network primordial, real backend spike.** Investigate lowering onto the existing
 native socket binary (`docs/ROADMAP_2036.md`) before committing to a new raw
 host import; this PR's gate is a decision, not necessarily code, if the spike shows the
 existing socket work is not yet reusable at this layer.
4. **PR4: Http and Queue as derived capabilities over Network,** blocked on the first-class
 functions/closures gap (gap register item 6) for general request dispatch; ship the
 record types and a single fixed-route `respond` primitive as the v1 slice, explicitly not
 the general dispatch table.
5. **PR5: Auth, Tenant, Secret plus `lumen effects`.** This is where the flagship worked
 example in Section 3 becomes a real conformance test (a negative test case expecting the
 compile error when `Tenant` is omitted), and where the CLI subcommand ships.

Each PR's gate, restated once: seed-first opcode plus interpreter change, a census entry
(`LANGUAGE.md`/`conformance/` pattern), self-hosted-compiler lockstep parity, and a
determinism-contract conformance test for the fake-versus-real split. No PR in this plan
claims a performance number, so the perf gate (`docs/ROADMAP_2036.md` section 4 item 3) is not
invoked; if a future PR does make a speed claim, it is subject to Law P and the honesty gates
per that same section.

## Alignment with the lambda-cap obligations

A discharge table, stated plainly rather than folded into prose, because overclaiming here is
the exact failure mode `docs/RISKS_AND_OPEN_PROBLEMS.md` warns against (risk 3, the zero-legacy
constraint being "operationally unfalsifiable" when claims are not pinned down):

| `docs/spec/LAMBDA_CAP.md` obligation | Discharged by this RFC? |
|---|---|
| Theorem 2 (purity soundness): zero capability parameters implies zero effects | Yes, trivially, and already true today for `Console` alone; this RFC does not strengthen the proof, it only extends the set of kinds the same trivial argument covers. |
| Theorem 1 (type soundness / progress+preservation) | No. Not attempted here; this RFC adds surface types and opcodes, not a checked type system for effect rows. `lumen effects` as proposed is a reporting tool, not a soundness-proof-carrying feature. |
| Theorem 3 (capability non-escape, region-based) | No, and cannot be, because `handle[c]` (the construct the theorem is stated over) does not exist in this design. The Section 3 worked example proves a weaker, real, but different property (ordinary parametric scoping via a smart constructor), and this RFC is explicit that the two are not the same claim. |
| Theorem 4 (determinism/replay) | Partially motivated, not discharged. Section 4 proposes a taint-marker mechanism consistent with the contract's stated closed set of nondeterminism sources, but no record/replay tape format is designed here (that is `docs/ROADMAP_2036.md` Arc 2's separate `lumen run --record` work item). |
| One-shot versus multi-shot handlers | Out of scope entirely. No handler construct is proposed, so the one-shot/multi-shot distinction (`docs/spec/LAMBDA_CAP.md` Section 3, the riskiest lemma per Section 5) does not arise. |
| Affine capability context `D` (linearity checking) | Not implemented. `LANGUAGE.md` documents no borrow/move/affine checking today; this RFC's "cannot construct without holding" pattern (Section 3) relies on ordinary parameter presence, not on a linearity checker verifying single-use. |

What stays out until mechanized, stated once: any handler-installation syntax, any multi-shot
capability, and any claim that a function's effect row is *proven* sound by a type-soundness
theorem rather than reported by a structural analysis. This RFC is a v1 that gives derived
purity and parametric scoping today, in exchange for explicitly not yet giving the mechanized
non-escape or soundness guarantees the calculus is written to eventually provide.

## Diagnostics

No new diagnostic codes are specified in this RFC (per the template's instruction, this section
exists to be filled when there is a concrete family to name). The two diagnostics implied by
Section 3's worked example (a missing-capability-parameter compile error, and a
`TAPE_BACKEND_MISMATCH`-style determinism violation already named in
`docs/spec/DETERMINISM_CONTRACT.md`) are left to the implementation RFC that follows
this one, since assigning codes here without an implementation to test them against would be
inventing detail this RFC's quality bar forbids.

## Alternatives considered

**A `with`/handler block as new syntax**, mirroring `handle[c]` directly in the surface. Costs
a new keyword and a new grammar production (`docs/GRAMMAR.md` currently has no such
production), against the one-mechanism rule and the null hypothesis above, for a benefit
(dynamic capability installation, multi-shot) that this RFC has already scoped out of v1
(Section 6). Rejected for v1; may be re-proposed once `handle[c]` itself is designed.

**Annotated effect rows on function signatures** (write `-> Unit ! {Console}` explicitly),
rather than deriving them. Rejected because `docs/spec/LAMBDA_CAP.md` states plainly
that "effects are derived, not declared" is a design commitment, and an annotation the compiler
must also independently verify reintroduces exactly the two-sources-of-truth problem the
calculus is built to avoid.

**Do nothing** (leave `Console` as the only capability). This is the status quo the gap
register already calls "the single biggest gap" (`docs/ROADMAP_2036.md`). Rejected
because it blocks all of Arc 2.

## Migration and editions

Not backwards-incompatible: adding new capability types and opcodes does not change the
meaning of any program that does not use them. `Console`'s existing signature and behavior are
unchanged. No edition bump is proposed; this RFC is additive only.

## Open questions

1. **The multi-operation capability gap.** `docs/spec/LAMBDA_CAP.md`'s `(T-Use)` rule ties one
 result type `Tres(c)` to a kind `c`, but every non-trivial capability here has multiple
 operations. Experiment: extend the rule to `use k.op e: Tres(c, op)` and re-check whether
 Theorems 1 and 2's proof sketches still go through unchanged, versus modeling each operation
 as its own kind sharing a region (for example `ConsolePrint`, `ConsolePrintInt`) and checking
 whether that breaks the "one primordial handler per kind" framing in
 `seed/ARCHITECTURE.md`.
2. **How does `cap.op(args)` elaborate to `use k e`?** `docs/spec/LAMBDA_CAP.md` Section 6
 states records, traits, and `Result` elaborate to the kernel but does not state the
 elaboration for method-call-on-capability syntax. Experiment: write the elaboration rule
 explicitly, then, once `lumen effects` exists, add a conformance test comparing the row a
 hand-written `use`-based term produces against the row the compiler derives for the
 equivalent surface form.
3. **Do deterministic fakes need closures?** Section 4 proposes record-based fakes precisely
 because first-class functions do not exist (gap register item 6). Experiment: build
 `FakeClock` as a record-plus-index value, drive two programs through different scripted
 sequences, and check whether the conformance census can express every fake scenario needed
 for PR1/PR2 without a closure; if any scenario cannot, escalate the closure gap's priority.
4. **Does the attenuation pattern (`TenantSql`) need new syntax, or is Section 3's plain
 function sufficient?** Experiment: implement the worked example as written, once effect
 derivation exists, and confirm the type checker rejects `get_balance_unsafe` for the stated
 reason (missing `tenant` in scope) rather than some unrelated error; if the current type
 checker cannot express the rejection at all, escalate to needing new checking machinery
 (not new syntax).
5. **What is the real backend for `Sql`?** No native database driver exists, and per
 `docs/MANIFESTO.md` no foreign one is permitted. Experiment: time-box a spike on whether the
 existing native socket binary (`docs/ROADMAP_2036.md`) plus a from-scratch Lumen
 wire-protocol client for one database (for example a from-scratch Postgres wire client) is
 feasible before PR4/PR5 are scheduled; if not feasible in-window, `Sql` stays fake-only
 until a dedicated RFC.
6. **Row-annotation taint versus a distinct taint type.** Section 4 proposes reusing the
 `Multi`-marker pattern for real-versus-fake taint. Experiment: prototype both against the
 `Network` capability's fake/real split and check which one the canonical Diagnostic schema
 (`docs/DECISIONS.md` D8) can express without a second diagnostic family, since D8 forbids any
 dimension from forking the Diagnostic.
7. **The D9-versus-LANGUAGE.md contradiction flagged in Section 4.** Is `docs/DECISIONS.md` D9's
 "Lumen-mu has no floating point at all" simply stale (predating the float work
 `docs/ROADMAP_2036.md` now certifies as done), or does it still bind something this RFC's
 Clock/Random signatures need to respect? Experiment: none needed beyond reading D9's git
 history against the float landing date and updating D9's text; flagged here because it was
 discovered while reading the required determinism sources for this RFC, not invented.

Open questions count: 7.
