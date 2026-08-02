# Deploying the Lumen HTTP server

Status: v1, current as of the serve-bundle change.

This document covers one decision and how to act on it: **a deployed Lumen HTTP server must ship a
prebuilt binary, never the compiler that produces it.** It states the failure that motivated the
rule, the two commands that implement it, and the gate that keeps it true.

---

## 1. The rule

There are two ways to run the native HTTP server, and only one of them belongs in a container.

| | module | imports the toolchain | compiles at start |
|---|---|---|---|
| development | `native/lumen_serve_native.mjs <config.json>` | yes | yes |
| **deployment** | **`native/lumen_serve_host.mjs <bundleDir>`** | **no** | **never** |

`lumen_serve_native.mjs` is both the builder and the runner. It imports `./pipeline.mjs` at module
scope and reads `examples/http/http_serve.lm` at load time, so any process running it needs the
whole toolchain, `clang`, and the kernel source present. That is exactly right for local iteration
and exactly wrong for a deployed service.

`lumen_serve_host.mjs` imports node builtins only. It cannot compile. That is not an efficiency
claim, it is a structural property, and `native/serve_bundle_test.mjs` asserts it two ways (see
section 5).

---

## 2. Why: compiling at start is a latency bug that converts into a cost bug

A deployment of this server that ran `lumen_serve_native.mjs` as its container entrypoint paid a
full `emit_fn.lm -> C -> clang -O2` compile on every cold start. Measured on a real scale-to-zero
deployment:

```
instance start -> listening, compiling at start        13,223 ms
instance start -> listening, prebuilt binary present        11 ms
```

Two containers built from the same Dockerfile, 1165x apart.

The part worth internalising is what happened next. The slow start was not diagnosed, it was
**hidden**, by giving the service a minimum-instance floor with CPU always allocated. That makes
the symptom vanish and bills continuous CPU for a container that is idle almost all of the time.
Over one five-day window it produced 816,867 billed CPU-seconds for a service serving a handful of
requests per day.

> **Warm-pinning is not a fix for a slow start. It is a way of paying for one continuously.**

If you find yourself reaching for a minimum-instance floor on a Lumen edge, the start is too slow
and section 3 is the actual fix.

### Why the earlier fix was not enough

An intermediate fix cached the compiled binary into the image layer at build time, so a cold start
could reuse it. That made the compile *unlikely*. It did not make it *impossible*, and nothing
detected the difference: images built before the cache existed kept compiling on every start,
undetected, because every health check looked at URLs and none looked at startup.

The bundle removes the possibility rather than the occurrence. A runtime that has no compiler
cannot silently start using one.

---

## 3. How to deploy

Two commands. The first runs at image build time, the second is the container entrypoint.

```bash
# build time: compile once, emit the artifact
node native/lumen_serve_native.mjs --emit-bundle <config.json> <bundleDir>

# run time: no compiler, no clang, no kernel source
node native/lumen_serve_host.mjs <bundleDir>
```

The canonical container shape is two stages, so the toolchain physically cannot reach the runtime
layer:

```dockerfile
# --- stage 1: build the bundle (toolchain lives ONLY here) ---
FROM node:22-bookworm-slim AS builder
RUN apt-get update && apt-get install -y --no-install-recommends clang git ca-certificates && apt-get clean
WORKDIR /srv
# PIN a commit, never a branch. See section 6.
ARG LUMEN_REF=<40-hex-commit-sha>
RUN git init lumen && cd lumen \
  && git remote add origin https://github.com/lumen-source/lumen.git \
  && git fetch --depth 1 origin "${LUMEN_REF}" \
  && git checkout FETCH_HEAD
RUN cd lumen/seed && npm install --no-audit --no-fund \
  && cd ../native && npm install --no-audit --no-fund
COPY routes.json /srv/edge/
COPY site/ /srv/edge/site/
RUN node /srv/lumen/native/lumen_serve_native.mjs --emit-bundle /srv/edge/routes.json /srv/bundle

# --- stage 2: runtime (a binary and a socket host) ---
FROM node:22-bookworm-slim
COPY --from=builder /srv/bundle /srv/bundle
COPY --from=builder /srv/lumen/native/lumen_serve_host.mjs /srv/lumen_serve_host.mjs
ENV PORT=8080
EXPOSE 8080
CMD ["node", "/srv/lumen_serve_host.mjs", "/srv/bundle"]
```

Measured on a real 25-route static site with this shape: a **376 KB** bundle (34 KB native binary
plus 341 KB of page bodies) replacing an image that carried clang, git and a full clone of this
repo, starting in **137 ms with `clang` absent from `PATH` entirely**, serving bytes identical to
what the compile-at-start server returned for every route.

`PORT` is read from the environment when set, so a platform that injects it works without config
changes.

---

## 4. What is in a bundle

```
bundleDir/
  serve.bin       the native serve binary (stdin/stdout framed request/response loop)
  body.block      the concatenated route bodies, streamed into the binary once at startup
  bundle.json     the manifest
  <hostFiles>     any hostFile bodies, copied in so the runtime needs nothing from the source tree
```

`bundle.json` fields:

| field | meaning |
|---|---|
| `format` | manifest version. The host **refuses** anything it does not know, rather than guessing. |
| `bin`, `bodyBlock` | filenames within the bundle |
| `port` | default listen port, overridden by `PORT` in the environment |
| `proxyPass` | origin for unmatched requests, or `null` for an in-kernel 404 |
| `reqCap` | the request window from the kernel's memory map, pinned at build time |
| `hostFiles` | bodies too large for the kernel's body window, served from disk by the host |
| `routes` | informational, for startup logs |

`reqCap` deserves a note. It is recorded rather than assumed so that a bundle built by a toolchain
with a different memory map **fails loudly at startup** instead of silently truncating every
request at the wrong offset. Silent truncation is the worse failure, so the manifest is written to
make it impossible.

---

## 5. The gate

`native/serve_bundle_test.mjs`, wired into `gate.yml`. Thirteen checks, of which two carry the
contract:

1. **Behavioural.** The host is spawned with `PATH` stripped to a directory that provably contains
   no `clang`, then asked to serve. **A host that serves at all is a host that provably did not
   compile.** This is the assertion that catches a regression in the field, not just in review.
2. **Structural.** The host's import graph is asserted to be node-builtins-only. The behavioural
   test proves *this* build does not compile; this one prevents a future edit from quietly
   reintroducing the import that would make compiling possible again.

Run it directly:

```bash
node native/serve_bundle_test.mjs
```

---

## 6. Pin the toolchain to a commit, never a branch

`ARG LUMEN_REF` must be a 40-hex commit sha.

Building from a branch means images built weeks apart contain different compilers, with nothing
recording which. That is not a theoretical concern: it is how a landed cold-start fix reached two
deployed services and missed four others, and why nobody noticed for weeks. Each image was
individually reasonable and the fleet was silently inconsistent.

If your build system can also pass `--build-arg LUMEN_REF=...`, **do not use it.** A `--build-arg`
overrides the Dockerfile's `ARG` default, so a pinned Dockerfile plus a branch-valued build-arg
gives you an unpinned build that reads as pinned. Keep the pin in exactly one place. "Two places
that must agree" is the shape of the bug, not a fix for it.

---

## 7. Checklist

Before a Lumen HTTP server goes to production:

- [ ] The container entrypoint is `lumen_serve_host.mjs`, not `lumen_serve_native.mjs`.
- [ ] `clang`, `git` and this repo appear only in a builder stage, never in the runtime image.
- [ ] `LUMEN_REF` is a commit sha, and nothing overrides it at build time.
- [ ] `node native/serve_bundle_test.mjs` passes.
- [ ] The service has **no** minimum-instance floor and CPU is not always-allocated. If something
      seems to need one, re-read section 2.
- [ ] A cold start was actually observed. Read the startup log line: it says
      `prebuilt bundle - no compile at start` when correct, and names `emit_fn.lm` when the
      container is compiling. Health checks that only fetch a URL cannot tell these apart, which
      is precisely how this went unnoticed.
