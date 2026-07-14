# t08: sum types + match + ?

Write a Lumen program with:

- `type DivError = | DivByZero`
- a function `checked_div(a: Int, b: Int) -> Result[Int, DivError]` that returns `err(DivByZero)`
  when `b == 0`, else `ok(a / b)`
- a function `show(r: Result[Int, DivError], console: Console) -> Unit` that `match`es `r`:
  on `ok(v)` prints `"ok "` then `v` then a newline; on `err(e)` matches `e` and, for
  `DivByZero`, prints `"div by zero\n"`
- a `main(console: Console) -> Unit` that calls `show(checked_div(20, 4), console)` then
  `show(checked_div(9, 0), console)`

Print nothing else.
