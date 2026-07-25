# Task: scalar Black-Scholes European call

The exact prompt given to the author (human or AI), verbatim, no domain information beyond this:

> Write a program that computes the Black-Scholes price of a European call option, using the
> Abramowitz-Stegun 7.1.26 polynomial approximation for the standard normal CDF. Formula:
>   d1 = (ln(S/K) + (r + 0.5*sigma^2)*T) / (sigma*sqrt(T))
>   d2 = d1 - sigma*sqrt(T)
>   call_price = S*N(d1) - K*exp(-r*T)*N(d2)
> where N(x) is the standard normal CDF via Abramowitz-Stegun 7.1.26:
>   t = 1 / (1 + 0.2316419*|x|)
>   poly = t*(0.319381530 + t*(-0.356563782 + t*(1.781477937 + t*(-1.821255978 + t*1.330274429))))
>   pdf = exp(-x^2/2) / sqrt(2*pi)
>   upper_tail_N = 1 - pdf*poly
>   N(x) = upper_tail_N if x >= 0, else 1 - upper_tail_N
>
> Compute the price for these 4 fixed cases (S, K, r, T, sigma), and print round(price * 10000) as
> an integer, one per line, in this exact order:
>   (100, 100, 0.05, 1.0, 0.20)
>   (100, 110, 0.05, 1.0, 0.20)
>   (100,  90, 0.05, 0.5, 0.30)
>   ( 50,  50, 0.02, 2.0, 0.25)

## Pass criterion

Exact stdout, in order, nothing else:
```
104506
60401
154860
79020
```

## Rules for the author (whoever/whatever it is)

- No reference solution, no existing example in this repo, may be consulted (defeats the point).
- The language's own reference documentation (e.g. Lumen's `LANGUAGE.md`) MAY and SHOULD be
  consulted - that is the legitimate, intended way to learn the language, not a measurement leak.
- Every compile/check/run attempt counts as one round, whether it fails or succeeds. Report every
  round, including ones that "compiled fine but printed the wrong thing."
- Report honestly even on failure. A DNF (did not finish) is valid data, not something to hide.

## Why this specific task

Reused from `bench/latency_corpus/kernel.lm` (the existing compile-latency shootout's Black-Scholes
kernel), which already has hand-written twins in Lumen, C, Go, Java, and Python. Picking an
already-cross-implemented kernel means the "correct" answer is independently known (four fixed
numeric cases, not fuzzable), and future task additions to this corpus can reuse the same
discipline (small, self-contained, numerically verifiable, no library dependency beyond the
language's own math builtins).
