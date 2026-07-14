# Contributing

Lumen improves through one loop: write real Lumen, hit friction, turn the friction into a
failing test, make the minimal seed/compiler change that turns it green, prove no speed
regression (`node seed/perf.mjs`), land it. One change per PR, failing-test-first.

All gates must stay green: `cd seed && npm test`, plus the native gates in `native/`.
The interpreter is the reference oracle; the backend is never allowed to disagree with it.

By contributing you certify the Developer Certificate of Origin (developercertificate.org);
sign commits with `git commit -s`.

## Developer Certificate of Origin (DCO)

Lumen requires a Developer Certificate of Origin (DCO 1.1) on all contributions. Every commit must
include a `Signed-off-by` footer with your name and email, e.g.:

```
Signed-off-by: Jane Doe <jane@example.com>
```

Automate this with `git commit -s` or add the footer by hand.

### What the DCO certifies

By signing off, you are certifying that:

1. You have written or have the right to pass on the contribution.
2. The contribution does not violate anyone else's rights (copyright, patent, trademark, etc.).
3. You understand and agree that the project may be distributed under the Apache-2.0 license.
4. You are aware of these terms: https://developercertificate.org

The DCO is a lightweight alternative to a full Contributor License Agreement. It makes the legal
basis of each contribution explicit and traceable, which becomes critical once the project is public
and the company retains the right to license service-layer code (Cloud, Verify) differently from
the open-source core (the compiler and language, which stay Apache-2.0 forever).

### Why the project requires it

Lumen is open source (Apache-2.0), but the business strategy (OPEN_SOURCE_AND_BUSINESS.md) depends
on the ability to license future service layers restrictively without retroactively relicensing
the core. Once a company starts relicensing open-source code after the community has contributed,
it detonates trust (as happened with Terraform and OpenTofu). The DCO, in place from day one,
means contributors opt into that model knowingly, and the company never has to choose between
paying contributors to retroactively agree or breaking community trust. It is the irreversible
choice that lets the rest of the strategy evolve freely.
