# t09: pricing-flavored (present value)

Write a Lumen program with:

- a function `present_value(cashflow: Float, rate: Float, periods: Float) -> Float` that
  returns `cashflow / pow(1.0 + rate, periods)`
- a `main(console: Console) -> Unit` that prints
  `round(present_value(110.25, 0.05, 2.0) * 100.0)` with `console.print_int` (the present
  value scaled by 100, as an Int)

Print nothing else.
